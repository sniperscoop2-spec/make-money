begin;

create extension if not exists pgcrypto;

create table if not exists public.make_money_casino_daily (
  player_id uuid primary key references public.make_money_players(id) on delete cascade,
  wager_day date not null default current_date,
  wagered_today numeric(30,4) not null default 0 check (wagered_today >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists make_money_casino_daily_day_idx
  on public.make_money_casino_daily(wager_day);

alter table public.make_money_casino_daily enable row level security;

create table if not exists public.make_money_casino_spins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  operation_key text not null,
  bet numeric(20,0) not null check (bet >= 10 and bet <= 100),
  choice text not null check (choice in ('red','black')),
  result_number smallint not null check (result_number between 0 and 36),
  result_color text not null check (result_color in ('red','black','green')),
  payout numeric(20,0) not null check (payout >= 0),
  balance_after numeric(30,4) not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (player_id, operation_key)
);

create index if not exists make_money_casino_spins_player_created_idx
  on public.make_money_casino_spins(player_id, created_at desc);

alter table public.make_money_casino_spins enable row level security;

create or replace function public.make_money_casino_roulette(
  p_session_hash text,
  p_bet numeric,
  p_choice text,
  p_operation_key text
)
returns table(
  result_number integer,
  result_color text,
  won boolean,
  payout numeric,
  net_change numeric,
  balance numeric,
  wagered_today numeric,
  daily_wager_limit numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_balance numeric(30,4);
  v_wagered numeric(30,4);
  v_wager_day date;
  v_bet numeric(20,0);
  v_result integer;
  v_color text;
  v_won boolean;
  v_payout numeric(20,0);
  v_balance_after numeric(30,4);
  v_existing record;
  v_random bytea;
  v_daily_limit constant numeric := 1000;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_session';
  end if;
  if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'invalid_operation_key';
  end if;
  v_bet := trunc(coalesce(p_bet,0));
  if v_bet < 10 or v_bet > 100 then
    raise exception 'invalid_bet';
  end if;
  if p_choice not in ('red','black') then
    raise exception 'invalid_choice';
  end if;

  select s.player_id
    into v_player_id
  from public.make_money_sessions s
  where s.token_hash = p_session_hash
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_player_id is null then
    raise exception 'invalid_or_expired_session';
  end if;

  -- Serialize identical operations so a retry cannot ever double-charge the player.
  perform pg_advisory_xact_lock(hashtextextended(v_player_id::text || ':' || p_operation_key, 0));

  select * into v_existing
  from public.make_money_casino_spins
  where player_id = v_player_id and operation_key = p_operation_key
  limit 1;

  if found then
    select coalesce(d.wagered_today,0)
      into v_wagered
    from public.make_money_casino_daily d
    where d.player_id = v_player_id
      and d.wager_day = current_date;
    return query select v_existing.result_number::integer,
      v_existing.result_color,
      (v_existing.payout > 0),
      v_existing.payout,
      (v_existing.payout - v_existing.bet),
      v_existing.balance_after,
      coalesce(v_wagered,0),
      v_daily_limit;
    return;
  end if;

  select balance into v_balance
  from public.make_money_players
  where id = v_player_id
  for update;

  if v_balance is null then raise exception 'player_not_found'; end if;
  if v_balance < v_bet then raise exception 'insufficient_balance'; end if;

  select coalesce(wagered_today,0), wager_day
    into v_wagered, v_wager_day
  from public.make_money_casino_daily
  where player_id = v_player_id
  for update;

  if not found then
    insert into public.make_money_casino_daily(player_id, wager_day, wagered_today)
    values (v_player_id, current_date, 0)
    on conflict (player_id) do nothing;
    select coalesce(wagered_today,0), wager_day
      into v_wagered, v_wager_day
    from public.make_money_casino_daily
    where player_id = v_player_id
    for update;
  end if;

  if v_wager_day <> current_date then
    v_wagered := 0;
    update public.make_money_casino_daily
      set wager_day = current_date, wagered_today = 0, updated_at = now()
    where player_id = v_player_id;
  end if;

  if v_wagered + v_bet > v_daily_limit then
    raise exception 'daily_wager_limit_reached';
  end if;

  v_random := gen_random_bytes(4);
  v_result := ((get_byte(v_random,0)::bigint << 24)
             + (get_byte(v_random,1)::bigint << 16)
             + (get_byte(v_random,2)::bigint << 8)
             + get_byte(v_random,3)::bigint) % 37;

  if v_result = 0 then
    v_color := 'green';
  elsif v_result in (1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36) then
    v_color := 'red';
  else
    v_color := 'black';
  end if;

  v_won := v_color = p_choice;
  v_payout := case when v_won then v_bet * 2 else 0 end;
  v_balance_after := v_balance - v_bet + v_payout;

  update public.make_money_players
  set balance = v_balance_after, updated_at = now()
  where id = v_player_id;

  update public.make_money_casino_daily
  set wagered_today = v_wagered + v_bet, updated_at = now()
  where player_id = v_player_id;

  insert into public.make_money_casino_spins(
    player_id, operation_key, bet, choice, result_number, result_color,
    payout, balance_after
  ) values (
    v_player_id, p_operation_key, v_bet, p_choice, v_result, v_color,
    v_payout, v_balance_after
  );

  return query select v_result, v_color, v_won, v_payout,
    (v_payout - v_bet), v_balance_after, v_wagered + v_bet, v_daily_limit;
end;
$$;

revoke all on function public.make_money_casino_roulette(text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.make_money_casino_roulette(text,numeric,text,text) to service_role;

commit;
