create or replace function public.make_money_casino_blackjack_start(p_session_hash text, p_bet numeric, p_operation_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare pid uuid;bal numeric(30,4);wager numeric(30,4);day date;b numeric(20,0);lim numeric:=null;pc jsonb:='[]';dc jsonb:='[]';card jsonb;pv int;dv int;st text:='active';payout numeric:=0;newbal numeric;existing jsonb;rid uuid;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session';end if;if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key';end if;b:=trunc(coalesce(p_bet,0));if b<10 then raise exception 'invalid_bet';end if;
 select player_id into pid from make_money_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() limit 1;if pid is null then raise exception 'invalid_or_expired_session';end if;perform pg_advisory_xact_lock(hashtextextended(pid::text||':bj:start:'||p_operation_key,0));
 select jsonb_build_object('game','blackjack','round_id',r.id,'player_cards',r.player_cards,'dealer_cards',case when r.status='active' then jsonb_build_array(r.dealer_cards->0) else r.dealer_cards end,'status',r.status,'payout',r.payout,'balance',r.balance_after,'player_value',make_money_casino_blackjack_value(r.player_cards),'dealer_value',case when r.status='active' then make_money_casino_blackjack_value(jsonb_build_array(r.dealer_cards->0)) else make_money_casino_blackjack_value(r.dealer_cards) end,'is_split',coalesce(r.is_split,false),'active_hand',coalesce(r.active_hand,1),'hand2_cards',r.hand2_cards,'hand2_status',r.hand2_status,'hand2_payout',coalesce(r.hand2_payout,0),'hand2_value',case when r.hand2_cards is not null then make_money_casino_blackjack_value(r.hand2_cards) else null end,'finished',r.status<>'active') into existing from make_money_casino_blackjack_rounds r where r.player_id=pid and r.operation_key=p_operation_key limit 1;if existing is not null then return existing;end if;
 select balance into bal from make_money_players where id=pid for update;if bal is null then raise exception 'player_not_found';end if;if bal<b then raise exception 'insufficient_balance';end if;
 select coalesce(wagered_today,0),wager_day into wager,day from make_money_casino_daily where player_id=pid for update;if not found then insert into make_money_casino_daily(player_id,wager_day,wagered_today) values(pid,current_date,0) on conflict(player_id) do nothing;select coalesce(wagered_today,0),wager_day into wager,day from make_money_casino_daily where player_id=pid for update;end if;if day<>current_date then wager:=0;update make_money_casino_daily set wager_day=current_date,wagered_today=0,updated_at=now() where player_id=pid;end if;
 card:=make_money_casino_draw_card(pc);pc:=pc||jsonb_build_array(card);card:=make_money_casino_draw_card(pc);dc:=dc||jsonb_build_array(card);card:=make_money_casino_draw_card(pc||dc);pc:=pc||jsonb_build_array(card);card:=make_money_casino_draw_card(pc||dc);dc:=dc||jsonb_build_array(card);
 pv:=make_money_casino_blackjack_value(pc);dv:=make_money_casino_blackjack_value(dc);if pv=21 then if dv=21 then st:='push';payout:=b;else st:='blackjack';payout:=b*5/2;end if;elsif dv=21 then st:='lost';payout:=0;end if;newbal:=bal-b+case when st='active' then 0 else payout end;
 insert into make_money_casino_blackjack_rounds(player_id,operation_key,bet,player_cards,dealer_cards,status,payout,balance_after,finished_at,is_split,active_hand) values(pid,p_operation_key,b,pc,dc,st,payout,newbal,case when st='active' then null else now() end,false,1) returning id into rid;
 update make_money_players set balance=newbal,updated_at=now() where id=pid;update make_money_casino_daily set wagered_today=wager+b,updated_at=now() where player_id=pid;
 insert into make_money_transactions(player_id,type,amount,balance_before,balance_after,reference,metadata) values(pid,'casino_blackjack',newbal-bal,bal,newbal,p_operation_key,jsonb_build_object('game','blackjack','action','start','bet',b,'status',st,'payout',payout));
 return jsonb_build_object('game','blackjack','round_id',rid,'player_cards',pc,'dealer_cards',case when st='active' then jsonb_build_array(dc->0) else dc end,'status',st,'payout',payout,'balance',newbal,'wagered_today',wager+b,'daily_wager_limit',lim,'player_value',pv,'dealer_value',case when st='active' then make_money_casino_blackjack_value(jsonb_build_array(dc->0)) else dv end,'is_split',false,'active_hand',1,'hand2_cards',null,'hand2_status',null,'hand2_payout',0,'hand2_value',null,'finished',st<>'active');
end;$function$;

create or replace function public.make_money_casino_status(p_session_hash text)
returns TABLE(balance numeric, wagered_today numeric, daily_wager_limit numeric, active_blackjack jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare pid uuid; bal numeric; wager numeric; round jsonb;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 select s.player_id into pid from public.make_money_sessions s where s.token_hash=p_session_hash and s.revoked_at is null and s.expires_at>now() limit 1;
 if pid is null then raise exception 'invalid_or_expired_session'; end if;
 select p.balance into bal from public.make_money_players p where p.id=pid; if bal is null then raise exception 'player_not_found'; end if;
 select coalesce(d.wagered_today,0) into wager from public.make_money_casino_daily d where d.player_id=pid and d.wager_day=current_date;
 select jsonb_build_object('game','blackjack','round_id',r.id,'bet',r.bet,'player_cards',coalesce(r.player_cards,'[]'::jsonb),'dealer_cards',jsonb_build_array(coalesce(r.dealer_cards->0,'{}'::jsonb)),'status',r.status,'payout',0,'balance',r.balance_after,'player_value',public.make_money_casino_blackjack_value(coalesce(r.player_cards,'[]'::jsonb)),'dealer_value',public.make_money_casino_blackjack_value(jsonb_build_array(coalesce(r.dealer_cards->0,'{}'::jsonb))),'is_split',coalesce(r.is_split,false),'active_hand',coalesce(r.active_hand,1),'hand2_cards',r.hand2_cards,'hand2_status',r.hand2_status,'hand2_payout',coalesce(r.hand2_payout,0),'hand2_value',case when r.hand2_cards is not null then public.make_money_casino_blackjack_value(r.hand2_cards) else null end,'finished',false) into round from public.make_money_casino_blackjack_rounds r where r.player_id=pid and r.status='active' order by r.created_at desc limit 1;
 return query select bal,coalesce(wager,0),null::numeric,round;
end;
$function$;
