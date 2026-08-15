create or replace function public.make_money_get_mining_status_by_session(p_session_hash text)
returns table(level integer,name text,icon text,cost numeric,rate_per_hour numeric,description text,owned boolean,last_claim_at timestamptz,next_claim_at timestamptz)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_player uuid; v_expires timestamptz; v_revoked timestamptz;
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 select s.player_id,s.expires_at,s.revoked_at into v_player,v_expires,v_revoked from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=now() or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
 return query select * from public.make_money_get_mining_status(v_player);
end;
$$;

create or replace function public.make_money_claim_mining(p_session_hash text,p_operation_key text)
returns table(reward numeric,new_balance numeric,claimed_at timestamptz,next_claim_at timestamptz)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_player_id uuid; v_expires timestamptz; v_revoked timestamptz; v_last_claim timestamptz; v_now timestamptz:=now(); v_elapsed_seconds bigint; v_hours integer; v_rate numeric(20,4); v_reward numeric(20,4):=0; v_new_balance numeric(20,4); v_existing_amount numeric(20,4); v_existing_type text;
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
 select s.player_id,s.expires_at,s.revoked_at into v_player_id,v_expires,v_revoked from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=v_now or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
 select i.amount,i.operation_type into v_existing_amount,v_existing_type from public.make_money_idempotency i where i.player_id=v_player_id and i.operation_key=p_operation_key limit 1;
 if found then
  if v_existing_type<>'mining_claim' then raise exception 'operation_key_reused'; end if;
  select p.balance into v_new_balance from public.make_money_players p where p.id=v_player_id;
  select m.last_claim_at into v_last_claim from public.make_money_mining m where m.player_id=v_player_id;
  return query select coalesce(v_existing_amount,0),v_new_balance,coalesce(v_last_claim,v_now),coalesce(v_last_claim,v_now)+interval '1 hour'; return;
 end if;
 insert into public.make_money_mining(player_id,miner_level,mining_level,mining_rate,rate_per_hour,last_claim_at) values(v_player_id,1,1,10,10,v_now) on conflict(player_id) do nothing;
 select m.last_claim_at,coalesce(m.rate_per_hour,m.mining_rate,10) into v_last_claim,v_rate from public.make_money_mining m where m.player_id=v_player_id for update;
 v_elapsed_seconds:=greatest(0,floor(extract(epoch from (v_now-v_last_claim)))::bigint); v_hours:=least(24,floor(v_elapsed_seconds/3600)::integer);
 if v_hours>0 then
  v_reward:=v_hours*v_rate;
  if v_elapsed_seconds>86400 then update public.make_money_mining set last_claim_at=v_now,updated_at=v_now where player_id=v_player_id; else update public.make_money_mining set last_claim_at=v_last_claim+make_interval(hours=>v_hours),updated_at=v_now where player_id=v_player_id; end if;
  select t.new_balance into v_new_balance from public.make_money_apply_transaction(v_player_id,v_reward,'mining_claim','mining_v2',p_operation_key) t;
 else select p.balance into v_new_balance from public.make_money_players p where p.id=v_player_id; end if;
 select m.last_claim_at into v_last_claim from public.make_money_mining m where m.player_id=v_player_id;
 return query select v_reward,v_new_balance,v_last_claim,v_last_claim+interval '1 hour';
end;
$$;

create or replace function public.make_money_mining_action(p_session_hash text,p_level integer,p_operation_key text)
returns table(ok boolean,level integer,name text,cost numeric,rate_per_hour numeric,balance numeric)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v_player uuid; v_expires timestamptz; v_revoked timestamptz; v_current integer; v_catalog public.make_money_mining_catalog%rowtype; v_balance numeric;
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 if p_level is null or p_level<1 or p_level>100 then raise exception 'invalid_level'; end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
 select s.player_id,s.expires_at,s.revoked_at into v_player,v_expires,v_revoked from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=now() or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
 if exists(select 1 from public.make_money_idempotency i where i.player_id=v_player and i.operation_key=p_operation_key) then raise exception 'operation_key_reused'; end if;
 select greatest(1,least(10,coalesce(m.miner_level,m.mining_level,1))) into v_current from public.make_money_mining m where m.player_id=v_player for update;
 if not found then insert into public.make_money_mining(player_id,miner_level,mining_level,mining_rate,rate_per_hour,last_claim_at) values(v_player,1,1,10,10,now()); v_current:=1; end if;
 if p_level<>v_current+1 then raise exception 'invalid_mining_upgrade'; end if;
 select c.* into v_catalog from public.make_money_mining_catalog c where c.level=p_level and c.active; if not found then raise exception 'mining_module_not_found'; end if;
 if v_catalog.cost>0 then perform 1 from public.make_money_apply_transaction(v_player,-v_catalog.cost,'mining_upgrade',v_catalog.name,p_operation_key); else insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(v_player,p_operation_key,'mining_upgrade',0); end if;
 update public.make_money_mining set miner_level=p_level,mining_level=p_level,mining_rate=v_catalog.rate_per_hour,rate_per_hour=v_catalog.rate_per_hour,updated_at=now() where player_id=v_player;
 select p.balance into v_balance from public.make_money_players p where p.id=v_player;
 return query select true,p_level,v_catalog.name,v_catalog.cost,v_catalog.rate_per_hour,v_balance;
end;
$$;

drop index if exists public.make_money_mining_player_uidx;
drop index if exists public.make_money_idempotency_player_key_idx;
