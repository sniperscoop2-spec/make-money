-- Remove the daily salary ceiling from Make Money jobs.
-- Salary remains claimable once per hour, but accrued salary is no longer capped per day.

create or replace function public.make_money_job_action(p_session_hash text, p_job_id text, p_action text, p_operation_key text)
returns table(ok boolean, action text, job_id text, level integer, reward numeric, cost numeric, balance numeric, next_claim_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 v_player uuid; v_expires timestamptz; v_catalog public.make_money_job_catalog%rowtype; v_state public.make_money_job_state%rowtype; v_active public.make_money_job_state%rowtype; v_now timestamptz:=now(); v_balance numeric(20,4); v_reward numeric(20,4); v_hours bigint; v_available numeric(20,4);
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 if p_job_id is null or length(p_job_id)>64 or p_job_id !~ '^[a-z0-9_-]+$' then raise exception 'invalid_job'; end if;
 if p_action not in ('unlock','choose','claim') then raise exception 'invalid_action'; end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
 select s.player_id,s.expires_at into v_player,v_expires from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=v_now then raise exception 'invalid_or_expired_session'; end if;
 if exists(select 1 from public.make_money_idempotency i where i.player_id=v_player and i.operation_key=p_operation_key) then raise exception 'operation_key_reused'; end if;
 select c.* into v_catalog from public.make_money_job_catalog c where c.job_id=p_job_id and c.active;
 if not found then raise exception 'job_not_found'; end if;
 if p_action='unlock' then
  select js.* into v_state from public.make_money_job_state js where js.player_id=v_player and js.job_id=p_job_id for update;
  if found then raise exception 'already_unlocked'; end if;
  if v_catalog.training_cost>0 then perform 1 from public.make_money_apply_transaction(v_player,-v_catalog.training_cost,'job_training',p_job_id,p_operation_key); else insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(v_player,p_operation_key,'job_training',0); end if;
  insert into public.make_money_job_state(player_id,job_id,level,last_claim_at,active,earned_today,remainder,day_stamp,updated_at) values(v_player,p_job_id,1,v_now,false,0,0,current_date,v_now);
  select p.balance into v_balance from public.make_money_players p where p.id=v_player;
  return query select true,p_action,p_job_id,1,0::numeric,v_catalog.training_cost,v_balance,v_now+interval '1 hour'; return;
 end if;
 if p_action='choose' then
  select js.* into v_state from public.make_money_job_state js where js.player_id=v_player and js.job_id=p_job_id for update;
  if not found then raise exception 'job_locked'; end if;
  update public.make_money_job_state js set active=false,updated_at=v_now where js.player_id=v_player and js.active;
  update public.make_money_job_state js set active=true,last_claim_at=v_now,remainder=0,updated_at=v_now,day_stamp=current_date,earned_today=case when js.day_stamp=current_date then js.earned_today else 0 end where js.player_id=v_player and js.job_id=p_job_id;
  insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(v_player,p_operation_key,'job_choose',0);
  select p.balance into v_balance from public.make_money_players p where p.id=v_player;
  return query select true,p_action,p_job_id,v_state.level,0::numeric,0::numeric,v_balance,v_now+interval '1 hour'; return;
 end if;
 select js.* into v_active from public.make_money_job_state js where js.player_id=v_player and js.job_id=p_job_id and js.active for update;
 if not found then raise exception 'job_not_active'; end if;
 if v_active.day_stamp<>current_date then
  update public.make_money_job_state js set day_stamp=current_date,earned_today=0,remainder=0,updated_at=v_now where js.player_id=v_player and js.job_id=p_job_id;
  v_active.earned_today:=0; v_active.remainder:=0; v_active.day_stamp:=current_date;
 end if;
 if v_active.last_claim_at>v_now then raise exception 'invalid_job_clock'; end if;
 v_hours:=floor(extract(epoch from (v_now-v_active.last_claim_at))/3600)::bigint;
 if v_hours<1 then raise exception 'job_cooldown'; end if;
 v_available:=v_active.remainder+(v_hours::numeric*v_catalog.income_per_hour);
 v_reward:=greatest(0,v_available);
 if v_reward<=0 then raise exception 'job_no_salary'; end if;
 perform 1 from public.make_money_apply_transaction(v_player,v_reward,'job_salary',p_job_id,p_operation_key);
 update public.make_money_job_state js set last_claim_at=v_active.last_claim_at+make_interval(hours=>v_hours::integer),earned_today=v_active.earned_today+v_reward,remainder=greatest(0,v_available-v_reward),updated_at=v_now where js.player_id=v_player and js.job_id=p_job_id;
 select p.balance into v_balance from public.make_money_players p where p.id=v_player;
 return query select true,p_action,p_job_id,v_active.level,v_reward,0::numeric,v_balance,v_active.last_claim_at+make_interval(hours=>v_hours::integer)+interval '1 hour';
end;
$function$;

create or replace function public.make_money_get_job_progress(p_session_hash text)
returns table(job_id text, cooldown_seconds integer, last_claim_at timestamptz, next_claim_at timestamptz, available_salary numeric, progress_seconds integer, progress_percent numeric, earned_today numeric, daily_cap numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
 v_player uuid; v_expires timestamptz; v_now timestamptz:=now(); v_state public.make_money_job_state%rowtype; v_catalog public.make_money_job_catalog%rowtype; v_hours bigint; v_available numeric(20,4); v_elapsed bigint; v_progress_seconds integer; v_progress_percent numeric;
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 select s.player_id,s.expires_at into v_player,v_expires from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=v_now then raise exception 'invalid_or_expired_session'; end if;
 for v_state in select * from public.make_money_job_state where player_id=v_player and active loop
  select c.* into v_catalog from public.make_money_job_catalog c where c.job_id=v_state.job_id and c.active;
  if not found then continue; end if;
  if v_state.day_stamp<>current_date then v_state.earned_today:=0; v_state.remainder:=0; end if;
  v_elapsed:=greatest(0,floor(extract(epoch from (v_now-v_state.last_claim_at)))::bigint);
  v_hours:=floor(v_elapsed/3600)::bigint;
  v_available:=v_state.remainder+(v_hours::numeric*v_catalog.income_per_hour);
  if v_hours>=1 then v_progress_seconds:=3600; v_progress_percent:=100; else v_progress_seconds:=v_elapsed::integer; v_progress_percent:=(v_elapsed::numeric/3600)*100; end if;
  return query select v_state.job_id,3600,v_state.last_claim_at,v_state.last_claim_at+interval '1 hour',greatest(0,v_available),v_progress_seconds,least(100,greatest(0,v_progress_percent)),v_state.earned_today,0::numeric;
 end loop;
end;
$function$;

create or replace function public.make_money_get_jobs(p_session_hash text)
returns table(job_id text, name text, training_cost numeric, income_per_hour numeric, daily_cap numeric, cooldown_seconds integer, unlocked boolean, active boolean, earned_today numeric)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_player uuid; v_expires timestamptz;
begin
 if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 select s.player_id,s.expires_at into v_player,v_expires from public.make_money_sessions s where s.token_hash=p_session_hash;
 if not found or v_expires<=now() then raise exception 'invalid_or_expired_session'; end if;
 return query
 select c.job_id,c.name,c.training_cost,c.income_per_hour,0::numeric,c.cooldown_seconds,
        (js.player_id is not null),coalesce(js.active,false),coalesce(js.earned_today,0)
 from public.make_money_job_catalog c
 left join public.make_money_job_state js on js.player_id=v_player and js.job_id=c.job_id
 where c.active order by c.training_cost,c.income_per_hour,c.job_id;
end;
$function$;
