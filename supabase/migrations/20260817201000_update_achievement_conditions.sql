create or replace function public.make_money_get_achievements(p_session_hash text)
returns table(achievement_id text,name text,description text,reward numeric,completed boolean,claimed boolean)
language plpgsql security definer set search_path to 'public' as $function$
declare v_player uuid; v_balance numeric;
begin
 select player_id into v_player from public.make_money_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() limit 1;
 if v_player is null then raise exception 'invalid_or_expired_session'; end if;
 select balance into v_balance from public.make_money_players where id=v_player;
 return query
 select c.achievement_id,c.name,c.description,c.reward,
 case c.achievement_id
  when 'first_claim' then exists(select 1 from public.make_money_transactions t where t.player_id=v_player and t.type='mining_claim')
  when 'first_job' then exists(select 1 from public.make_money_job_state j where j.player_id=v_player and j.job_id is not null)
  when 'first_property' then exists(select 1 from public.make_money_real_estate_state r where r.player_id=v_player and r.owned_units>0)
  when 'first_casino' then (exists(select 1 from public.make_money_casino_spins s where s.player_id=v_player) or exists(select 1 from public.make_money_casino_slots_spins s where s.player_id=v_player) or exists(select 1 from public.make_money_casino_blackjack_rounds b where b.player_id=v_player))
  when 'one_thousand' then v_balance>=1000
  when 'ten_thousand' then v_balance>=10000
  when 'hundred_thousand' then v_balance>=100000
  when 'first_case' then exists(select 1 from public.make_money_case_ops o where o.player_id=v_player)
  when 'first_crypto_trade' then exists(select 1 from public.make_money_crypto_trades t where t.player_id=v_player)
  when 'ten_mining_claims' then (select count(*) from public.make_money_transactions t where t.player_id=v_player and t.type='mining_claim')>=10
  when 'item_collector' then coalesce((select sum(i.quantity) from public.make_money_inventory i where i.player_id=v_player),0)>=10
  when 'property_investor' then coalesce((select sum(r.owned_units) from public.make_money_real_estate_state r where r.player_id=v_player),0)>=3
  else false end,
 coalesce(a.claimed_at is not null,false)
 from public.make_money_achievement_catalog c left join public.make_money_achievements a on a.player_id=v_player and a.achievement_id=c.achievement_id
 where c.active order by c.sort_order;
end;
$function$;

create or replace function public.make_money_claim_achievement(p_session_hash text,p_achievement_id text,p_operation_key text)
returns table(reward numeric,balance numeric,achievement_id text)
language plpgsql security definer set search_path to 'public' as $function$
declare v_player uuid;v_balance numeric(30,4);v_reward numeric(20,0);v_completed boolean;v_new_balance numeric(30,4);v_claimed_at timestamptz;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session';end if;
 if p_achievement_id is null or length(p_achievement_id)>64 then raise exception 'invalid_achievement';end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key';end if;
 select s.player_id into v_player from public.make_money_sessions s where s.token_hash=p_session_hash and s.revoked_at is null and s.expires_at>now() limit 1;
 if v_player is null then raise exception 'invalid_or_expired_session';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_player::text||':achievement:'||p_achievement_id,0));
 select c.reward into v_reward from public.make_money_achievement_catalog c where c.achievement_id=p_achievement_id and c.active;if v_reward is null then raise exception 'achievement_not_found';end if;
 select a.claimed_at into v_claimed_at from public.make_money_achievements a where a.player_id=v_player and a.achievement_id=p_achievement_id;if v_claimed_at is not null then raise exception 'achievement_already_claimed';end if;
 select p.balance into v_balance from public.make_money_players p where p.id=v_player for update;if v_balance is null then raise exception 'invalid_session';end if;
 v_completed:=case p_achievement_id
  when 'first_claim' then exists(select 1 from public.make_money_transactions t where t.player_id=v_player and t.type='mining_claim')
  when 'first_job' then exists(select 1 from public.make_money_job_state j where j.player_id=v_player and j.job_id is not null)
  when 'first_property' then exists(select 1 from public.make_money_real_estate_state r where r.player_id=v_player and r.owned_units>0)
  when 'first_casino' then (exists(select 1 from public.make_money_casino_spins s where s.player_id=v_player) or exists(select 1 from public.make_money_casino_slots_spins s where s.player_id=v_player) or exists(select 1 from public.make_money_casino_blackjack_rounds b where b.player_id=v_player))
  when 'one_thousand' then v_balance>=1000
  when 'ten_thousand' then v_balance>=10000
  when 'hundred_thousand' then v_balance>=100000
  when 'first_case' then exists(select 1 from public.make_money_case_ops o where o.player_id=v_player)
  when 'first_crypto_trade' then exists(select 1 from public.make_money_crypto_trades t where t.player_id=v_player)
  when 'ten_mining_claims' then (select count(*) from public.make_money_transactions t where t.player_id=v_player and t.type='mining_claim')>=10
  when 'item_collector' then coalesce((select sum(i.quantity) from public.make_money_inventory i where i.player_id=v_player),0)>=10
  when 'property_investor' then coalesce((select sum(r.owned_units) from public.make_money_real_estate_state r where r.player_id=v_player),0)>=3
  else false end;
 if not v_completed then raise exception 'achievement_not_completed';end if;
 insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(v_player,p_operation_key,'achievement_claim',v_reward) on conflict(player_id,operation_key) do nothing;if not found then raise exception 'operation_reused';end if;
 insert into public.make_money_achievements(player_id,achievement_id) values(v_player,p_achievement_id) on conflict do nothing;if not found then raise exception 'achievement_already_claimed';end if;
 v_new_balance:=v_balance+v_reward;update public.make_money_players p set balance=v_new_balance,updated_at=now() where p.id=v_player;
 update public.make_money_achievements a set claimed_at=now() where a.player_id=v_player and a.achievement_id=p_achievement_id;
 insert into public.make_money_transactions(player_id,amount,type,reference,metadata,balance_before,balance_after) values(v_player,v_reward,'achievement_reward',p_operation_key,jsonb_build_object('achievement_id',p_achievement_id),v_balance,v_new_balance);
 return query select v_reward,v_new_balance,p_achievement_id;
end;
$function$;
