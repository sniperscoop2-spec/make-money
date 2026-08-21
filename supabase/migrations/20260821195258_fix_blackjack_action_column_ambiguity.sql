-- Fix: plpgsql variables named is_split/active_hand collided with the
-- identically-named table columns inside embedded UPDATE statements
-- (same "column reference is ambiguous" bug class as the shop migration
-- earlier today). Renamed to v_is_split/v_active_hand.
create or replace function public.make_money_casino_blackjack_action(p_session_hash text, p_round_id uuid, p_action text, p_operation_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pid uuid;
  r record;
  pc jsonb; dc jsonb; hc2 jsonb;
  card jsonb;
  pv int; dv int; hv2 int;
  oldbal numeric; newbal numeric; extra numeric;
  response jsonb; existing jsonb;
  h1_status text; h2_status text;
  h1_bet numeric; h2_bet numeric;
  h1_doubled boolean; h2_doubled boolean;
  v_is_split boolean; v_active_hand smallint;
  h1_payout numeric := 0; h2_payout numeric := 0;
  total_payout numeric;
  round_finished boolean;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
  if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
  if p_action not in ('hit','stand','double','split') then raise exception 'invalid_blackjack_action'; end if;

  select player_id into pid from make_money_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() limit 1;
  if pid is null then raise exception 'invalid_or_expired_session'; end if;

  perform pg_advisory_xact_lock(hashtextextended(pid::text||':bj:action:'||p_operation_key,0));

  select a.response into existing from make_money_casino_blackjack_actions a where a.player_id=pid and a.operation_key=p_operation_key limit 1;
  if existing is not null then return existing; end if;

  select * into r from make_money_casino_blackjack_rounds where id=p_round_id and player_id=pid for update;
  if not found then raise exception 'blackjack_round_not_found'; end if;

  v_is_split := coalesce(r.is_split,false);
  v_active_hand := coalesce(r.active_hand,1);
  h1_status := r.status;
  h2_status := r.hand2_status;
  h1_bet := r.bet;
  h2_bet := r.hand2_bet;
  h1_doubled := coalesce(r.hand1_doubled,false);
  h2_doubled := coalesce(r.hand2_doubled,false);
  pc := r.player_cards;
  dc := r.dealer_cards;
  hc2 := r.hand2_cards;

  if (not v_is_split and h1_status<>'active')
     or (v_is_split and h1_status<>'active' and (h2_status is null or h2_status<>'active')) then
    raise exception 'blackjack_round_finished';
  end if;

  select balance into oldbal from make_money_players where id=pid for update;

  if p_action='split' then
    if v_is_split then raise exception 'blackjack_split_not_allowed'; end if;
    if h1_status<>'active' then raise exception 'blackjack_round_finished'; end if;
    if jsonb_array_length(pc)<>2 then raise exception 'blackjack_split_not_allowed'; end if;
    if (pc->0->>'rank') is distinct from (pc->1->>'rank') then raise exception 'blackjack_split_not_allowed'; end if;
    if oldbal < r.bet then raise exception 'insufficient_balance'; end if;

    hc2 := jsonb_build_array(pc->1);
    pc := jsonb_build_array(pc->0);
    h2_bet := r.bet;
    v_is_split := true;

    card := make_money_casino_draw_card(pc||dc||hc2);
    pc := pc||jsonb_build_array(card);
    card := make_money_casino_draw_card(pc||dc||hc2);
    hc2 := hc2||jsonb_build_array(card);

    newbal := oldbal - r.bet;
    update make_money_players set balance=newbal, updated_at=now() where id=pid;

    pv := make_money_casino_blackjack_value(pc);
    hv2 := make_money_casino_blackjack_value(hc2);

    if (r.player_cards->0->>'rank')='A' then
      h1_status := case when pv>21 then 'lost' else 'standing' end;
      h2_status := case when hv2>21 then 'lost' else 'standing' end;
      v_active_hand := 2;
    else
      h1_status := case when pv>21 then 'lost' when pv=21 then 'standing' else 'active' end;
      h2_status := 'active';
      v_active_hand := case when h1_status='active' then 1 else 2 end;
    end if;

    update make_money_casino_blackjack_rounds set
      player_cards=pc, dealer_cards=dc, hand2_cards=hc2, is_split=true, active_hand=v_active_hand,
      status=h1_status, hand2_status=h2_status, hand2_bet=h2_bet, balance_after=newbal
    where id=r.id;

  elsif p_action='double' then
    if v_active_hand=1 then
      if h1_status<>'active' or jsonb_array_length(pc)<>2 or h1_doubled then raise exception 'blackjack_double_not_allowed'; end if;
      extra := h1_bet;
      if oldbal < extra then raise exception 'insufficient_balance'; end if;
      card := make_money_casino_draw_card(pc||dc||coalesce(hc2,'[]'::jsonb));
      pc := pc||jsonb_build_array(card);
      h1_bet := h1_bet*2; h1_doubled := true;
      pv := make_money_casino_blackjack_value(pc);
      h1_status := case when pv>21 then 'lost' else 'standing' end;
      newbal := oldbal - extra;
      update make_money_players set balance=newbal, updated_at=now() where id=pid;
      if v_is_split and h1_status<>'active' and h2_status='active' then v_active_hand:=2; end if;
      update make_money_casino_blackjack_rounds set player_cards=pc, bet=h1_bet, hand1_doubled=true, status=h1_status, active_hand=v_active_hand, balance_after=newbal where id=r.id;
    else
      if h2_status<>'active' or jsonb_array_length(hc2)<>2 or h2_doubled then raise exception 'blackjack_double_not_allowed'; end if;
      extra := h2_bet;
      if oldbal < extra then raise exception 'insufficient_balance'; end if;
      card := make_money_casino_draw_card(pc||dc||hc2);
      hc2 := hc2||jsonb_build_array(card);
      h2_bet := h2_bet*2; h2_doubled := true;
      hv2 := make_money_casino_blackjack_value(hc2);
      h2_status := case when hv2>21 then 'lost' else 'standing' end;
      newbal := oldbal - extra;
      update make_money_players set balance=newbal, updated_at=now() where id=pid;
      update make_money_casino_blackjack_rounds set hand2_cards=hc2, hand2_bet=h2_bet, hand2_doubled=true, hand2_status=h2_status, balance_after=newbal where id=r.id;
    end if;

  elsif p_action='hit' then
    if v_active_hand=1 then
      if h1_status<>'active' then raise exception 'blackjack_round_finished'; end if;
      card := make_money_casino_draw_card(pc||dc||coalesce(hc2,'[]'::jsonb));
      pc := pc||jsonb_build_array(card);
      pv := make_money_casino_blackjack_value(pc);
      if pv>21 then h1_status:='lost'; elsif pv=21 then h1_status:='standing'; end if;
      if v_is_split and h1_status<>'active' and h2_status='active' then v_active_hand:=2; end if;
      update make_money_casino_blackjack_rounds set player_cards=pc, status=h1_status, active_hand=v_active_hand where id=r.id;
    else
      if h2_status<>'active' then raise exception 'blackjack_round_finished'; end if;
      card := make_money_casino_draw_card(pc||dc||hc2);
      hc2 := hc2||jsonb_build_array(card);
      hv2 := make_money_casino_blackjack_value(hc2);
      if hv2>21 then h2_status:='lost'; elsif hv2=21 then h2_status:='standing'; end if;
      update make_money_casino_blackjack_rounds set hand2_cards=hc2, hand2_status=h2_status where id=r.id;
    end if;

  elsif p_action='stand' then
    if v_active_hand=1 then
      if h1_status<>'active' then raise exception 'blackjack_round_finished'; end if;
      h1_status:='standing';
      if v_is_split and h2_status='active' then v_active_hand:=2; end if;
      update make_money_casino_blackjack_rounds set status=h1_status, active_hand=v_active_hand where id=r.id;
    else
      if h2_status<>'active' then raise exception 'blackjack_round_finished'; end if;
      h2_status:='standing';
      update make_money_casino_blackjack_rounds set hand2_status=h2_status where id=r.id;
    end if;
  end if;

  round_finished := (not v_is_split and h1_status<>'active')
     or (v_is_split and h1_status<>'active' and h2_status<>'active');

  if round_finished then
    while make_money_casino_blackjack_value(dc) < 17 loop
      card := make_money_casino_draw_card(pc||dc||coalesce(hc2,'[]'::jsonb));
      dc := dc||jsonb_build_array(card);
    end loop;
    dv := make_money_casino_blackjack_value(dc);

    if h1_status='lost' then
      h1_payout := 0;
    else
      pv := make_money_casino_blackjack_value(pc);
      if not v_is_split and pv=21 and jsonb_array_length(pc)=2 and dv<>21 then
        h1_status:='blackjack'; h1_payout:=h1_bet*5/2;
      elsif dv>21 or pv>dv then h1_status:='won'; h1_payout:=h1_bet*2;
      elsif pv=dv then h1_status:='push'; h1_payout:=h1_bet;
      else h1_status:='lost'; h1_payout:=0;
      end if;
    end if;

    if v_is_split then
      if h2_status='lost' then
        h2_payout := 0;
      else
        hv2 := make_money_casino_blackjack_value(hc2);
        if dv>21 or hv2>dv then h2_status:='won'; h2_payout:=h2_bet*2;
        elsif hv2=dv then h2_status:='push'; h2_payout:=h2_bet;
        else h2_status:='lost'; h2_payout:=0;
        end if;
      end if;
    end if;

    total_payout := h1_payout + coalesce(h2_payout,0);
    select balance into oldbal from make_money_players where id=pid for update;
    newbal := oldbal + total_payout;

    update make_money_players set balance=newbal, updated_at=now() where id=pid;
    update make_money_casino_blackjack_rounds set
      dealer_cards=dc, status=h1_status, hand2_status=h2_status,
      payout=total_payout, hand2_payout=coalesce(h2_payout,0), balance_after=newbal, finished_at=now()
    where id=r.id;

    insert into make_money_transactions(player_id,type,amount,balance_before,balance_after,reference,metadata)
    values(pid,'casino_blackjack',newbal-oldbal,oldbal,newbal,p_operation_key,
      jsonb_build_object('game','blackjack','action',p_action,'bet',h1_bet+coalesce(h2_bet,0),'status',h1_status,'hand2_status',h2_status,'payout',total_payout));

    response := jsonb_build_object(
      'game','blackjack','round_id',r.id,
      'player_cards',pc,'dealer_cards',dc,'status',h1_status,'payout',h1_payout,
      'balance',newbal,'player_value',make_money_casino_blackjack_value(pc),'dealer_value',dv,
      'is_split',v_is_split,'active_hand',v_active_hand,
      'hand2_cards',hc2,'hand2_status',h2_status,'hand2_payout',coalesce(h2_payout,0),
      'hand2_value',case when hc2 is not null then make_money_casino_blackjack_value(hc2) else null end,
      'finished',true
    );
  else
    response := jsonb_build_object(
      'game','blackjack','round_id',r.id,
      'player_cards',pc,'dealer_cards',jsonb_build_array(dc->0),'status',h1_status,'payout',0,
      'balance',oldbal,'player_value',make_money_casino_blackjack_value(pc),'dealer_value',make_money_casino_blackjack_value(jsonb_build_array(dc->0)),
      'is_split',v_is_split,'active_hand',v_active_hand,
      'hand2_cards',hc2,'hand2_status',h2_status,'hand2_payout',0,
      'hand2_value',case when hc2 is not null then make_money_casino_blackjack_value(hc2) else null end,
      'finished',false
    );
  end if;

  insert into make_money_casino_blackjack_actions(player_id,operation_key,round_id,response) values(pid,p_operation_key,r.id,response);
  return response;
end;
$function$;
