-- Telegram Stars shop: catalog, purchases ledger, mining boosts.
-- Purchases are only ever granted by make_money_shop_grant_purchase, which is
-- locked down to the service_role (the Telegram webhook edge function). It is
-- intentionally NOT reachable by anon/authenticated via PostgREST, because
-- nothing in Postgres can verify a Telegram Stars charge actually happened --
-- that verification only exists inside the authenticated Telegram webhook call.

create table if not exists public.make_money_shop_catalog (
  offer_id text primary key,
  title text not null,
  description text not null,
  stars_price integer not null check (stars_price > 0 and stars_price <= 100000),
  mm_amount numeric(20,4) not null default 0 check (mm_amount >= 0),
  mining_multiplier numeric(6,2) not null default 1 check (mining_multiplier >= 1 and mining_multiplier <= 10),
  mining_duration_hours integer not null default 0 check (mining_duration_hours >= 0 and mining_duration_hours <= 720),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.make_money_shop_catalog enable row level security;

create table if not exists public.make_money_shop_purchases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id),
  offer_id text not null references public.make_money_shop_catalog(offer_id),
  telegram_payment_charge_id text not null unique,
  telegram_user_id bigint not null,
  invoice_payload text not null,
  stars_amount integer not null,
  mm_granted numeric(20,4) not null default 0,
  boost_multiplier numeric(6,2) not null default 1,
  boost_hours integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.make_money_shop_purchases enable row level security;
create index if not exists make_money_shop_purchases_player_idx on public.make_money_shop_purchases(player_id, created_at desc);

create table if not exists public.make_money_boosts (
  player_id uuid primary key references public.make_money_players(id),
  mining_multiplier numeric(6,2) not null default 1,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.make_money_boosts enable row level security;

-- Seed / refresh the three offers. Prices and effects live server-side only;
-- the client never gets to choose or influence them.
insert into public.make_money_shop_catalog
  (offer_id, title, description, stars_price, mm_amount, mining_multiplier, mining_duration_hours, sort_order)
values
  ('boost_24h', 'Mining x2 -- 24h', 'Double your mining rate for 24 hours.', 100, 0, 2, 24, 1),
  ('pack_5000', '5,000 MM Pack', 'Instantly add 5,000 MM to your balance.', 250, 5000, 1, 0, 2),
  ('mega_pack', 'Mega Pack', 'x2 mining for 7 days, plus 25,000 MM instantly.', 1000, 25000, 2, 168, 3)
on conflict (offer_id) do update set
  title = excluded.title,
  description = excluded.description,
  stars_price = excluded.stars_price,
  mm_amount = excluded.mm_amount,
  mining_multiplier = excluded.mining_multiplier,
  mining_duration_hours = excluded.mining_duration_hours,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

-- Apply the active mining boost multiplier (if any) to a mining rate.
create or replace function public.make_money_apply_mining_boost(p_player_id uuid, p_base_rate numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_multiplier numeric(6,2); v_expires timestamptz;
begin
  select mining_multiplier, expires_at into v_multiplier, v_expires
  from public.make_money_boosts where player_id = p_player_id;
  if not found or v_expires is null or v_expires <= now() then
    return p_base_rate;
  end if;
  return p_base_rate * coalesce(v_multiplier, 1);
end;
$function$;

-- Apply the boost to the actual mining payout, keeping the return signature
-- and idempotency semantics of make_money_claim_mining unchanged for callers.
create or replace function public.make_money_claim_mining(p_session_hash text, p_operation_key text)
returns table(reward numeric, new_balance numeric, claimed_at timestamp with time zone, next_claim_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
 insert into public.make_money_mining_owned(player_id,level,rate_per_hour) select v_player_id,c.level,c.rate_per_hour from public.make_money_mining_catalog c where c.level=1 and c.active on conflict do nothing;
 select m.last_claim_at into v_last_claim from public.make_money_mining m where m.player_id=v_player_id for update;
 select coalesce(sum(o.rate_per_hour),0) into v_rate from public.make_money_mining_owned o where o.player_id=v_player_id;
 if v_rate<=0 then raise exception 'mining_module_not_found'; end if;
 v_rate := public.make_money_apply_mining_boost(v_player_id, v_rate);
 v_elapsed_seconds:=greatest(0,floor(extract(epoch from (v_now-v_last_claim)))::bigint); v_hours:=least(24,floor(v_elapsed_seconds/3600)::integer);
 if v_hours>0 then
  v_reward:=v_hours*v_rate;
  if v_elapsed_seconds>86400 then update public.make_money_mining set last_claim_at=v_now,updated_at=v_now where player_id=v_player_id; else update public.make_money_mining set last_claim_at=v_last_claim+make_interval(hours=>v_hours),updated_at=v_now where player_id=v_player_id; end if;
  select t.new_balance into v_new_balance from public.make_money_apply_transaction(v_player_id,v_reward,'mining_claim','mining_v3',p_operation_key) t;
 else select p.balance into v_new_balance from public.make_money_players p where p.id=v_player_id; end if;
 select m.last_claim_at into v_last_claim from public.make_money_mining m where m.player_id=v_player_id;
 return query select v_reward,v_new_balance,v_last_claim,v_last_claim+interval '1 hour';
end;
$function$;

-- Public catalog listing, gated by session like every other read in this app.
create or replace function public.make_money_shop_get_catalog(p_session_hash text)
returns table(offer_id text, title text, description text, stars_price integer, mm_amount numeric, mining_multiplier numeric, mining_duration_hours integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_player uuid; v_expires timestamptz; v_revoked timestamptz;
begin
  if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
  select s.player_id, s.expires_at, s.revoked_at into v_player, v_expires, v_revoked from public.make_money_sessions s where s.token_hash = p_session_hash;
  if not found or v_expires <= now() or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
  return query select c.offer_id, c.title, c.description, c.stars_price, c.mm_amount, c.mining_multiplier, c.mining_duration_hours
    from public.make_money_shop_catalog c where c.active order by c.sort_order;
end;
$function$;

-- Current boost state, for the shop UI and (optionally) the home dashboard.
create or replace function public.make_money_shop_get_boost_status(p_session_hash text)
returns table(mining_multiplier numeric, expires_at timestamp with time zone, active boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_player uuid; v_expires timestamptz; v_revoked timestamptz; v_row public.make_money_boosts%rowtype;
begin
  if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
  select s.player_id, s.expires_at, s.revoked_at into v_player, v_expires, v_revoked from public.make_money_sessions s where s.token_hash = p_session_hash;
  if not found or v_expires <= now() or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
  select * into v_row from public.make_money_boosts b where b.player_id = v_player;
  if not found or v_row.expires_at is null or v_row.expires_at <= now() then
    return query select 1::numeric, null::timestamptz, false;
  else
    return query select v_row.mining_multiplier, v_row.expires_at, true;
  end if;
end;
$function$;

-- Resolve a player id + validated offer for invoice creation. Runs with the
-- caller's session, so it can only ever build an invoice for the signed-in
-- player -- the returned player_id is what gets embedded in the Telegram
-- invoice payload and is what make_money_shop_grant_purchase later trusts.
create or replace function public.make_money_shop_prepare_invoice(p_session_hash text, p_offer_id text)
returns table(player_id uuid, offer_id text, title text, description text, stars_price integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_player uuid; v_expires timestamptz; v_revoked timestamptz; v_offer public.make_money_shop_catalog%rowtype;
begin
  if p_session_hash is null or length(p_session_hash)<>64 or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
  if p_offer_id is null or p_offer_id !~ '^[a-z0-9_]{1,32}$' then raise exception 'invalid_offer'; end if;
  select s.player_id, s.expires_at, s.revoked_at into v_player, v_expires, v_revoked from public.make_money_sessions s where s.token_hash = p_session_hash;
  if not found or v_expires <= now() or v_revoked is not null then raise exception 'invalid_or_expired_session'; end if;
  select * into v_offer from public.make_money_shop_catalog c where c.offer_id = p_offer_id and c.active;
  if not found then raise exception 'invalid_offer'; end if;
  return query select v_player, v_offer.offer_id, v_offer.title, v_offer.description, v_offer.stars_price;
end;
$function$;

-- Grants a purchase after Telegram confirms a successful Stars payment.
-- The Telegram charge id is Telegram's own idempotency key: a unique
-- constraint on it makes this at-most-once even if the webhook is retried
-- or called concurrently. The insert into make_money_shop_purchases happens
-- BEFORE any balance/boost mutation, so a duplicate charge id fails fast on
-- the unique constraint and nothing gets granted twice.
create or replace function public.make_money_shop_grant_purchase(
  p_invoice_payload text,
  p_telegram_charge_id text,
  p_telegram_user_id bigint,
  p_stars_amount integer
)
returns table(ok boolean, duplicate boolean, player_id uuid, offer_id text, mm_granted numeric, new_balance numeric, boost_multiplier numeric, boost_expires_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_player uuid; v_offer_id text; v_offer public.make_money_shop_catalog%rowtype;
  v_balance numeric(20,4); v_op_key text; v_new_multiplier numeric(6,2); v_new_expires timestamptz;
  v_existing public.make_money_shop_purchases%rowtype;
begin
  if p_telegram_charge_id is null or length(p_telegram_charge_id) < 3 or length(p_telegram_charge_id) > 128 then raise exception 'invalid_charge_id'; end if;
  if p_invoice_payload is null or p_invoice_payload !~ '^[0-9a-f-]{36}\.[a-z0-9_]{1,32}\.[A-Za-z0-9_-]{8,64}$' then raise exception 'invalid_payload'; end if;
  if p_stars_amount is null or p_stars_amount <= 0 then raise exception 'invalid_amount'; end if;

  v_player := split_part(p_invoice_payload, '.', 1)::uuid;
  v_offer_id := split_part(p_invoice_payload, '.', 2);

  select * into v_offer from public.make_money_shop_catalog c where c.offer_id = v_offer_id;
  if not found then raise exception 'invalid_offer'; end if;
  if v_offer.stars_price <> p_stars_amount then raise exception 'amount_mismatch'; end if;
  if not exists (select 1 from public.make_money_players p where p.id = v_player) then raise exception 'player_not_found'; end if;

  begin
    insert into public.make_money_shop_purchases
      (player_id, offer_id, telegram_payment_charge_id, telegram_user_id, invoice_payload, stars_amount, mm_granted, boost_multiplier, boost_hours)
    values
      (v_player, v_offer.offer_id, p_telegram_charge_id, p_telegram_user_id, p_invoice_payload, p_stars_amount, v_offer.mm_amount, v_offer.mining_multiplier, v_offer.mining_duration_hours);
  exception when unique_violation then
    select * into v_existing from public.make_money_shop_purchases sp where sp.telegram_payment_charge_id = p_telegram_charge_id;
    select p.balance into v_balance from public.make_money_players p where p.id = v_existing.player_id;
    select b.mining_multiplier, b.expires_at into v_new_multiplier, v_new_expires from public.make_money_boosts b where b.player_id = v_existing.player_id;
    return query select true, true, v_existing.player_id, v_existing.offer_id, v_existing.mm_granted, v_balance, coalesce(v_new_multiplier,1), v_new_expires;
    return;
  end;

  v_op_key := 'shop_' || substr(regexp_replace(p_telegram_charge_id, '[^A-Za-z0-9_-]', '_', 'g'), 1, 100);
  if v_offer.mm_amount > 0 then
    perform 1 from public.make_money_apply_transaction(v_player, v_offer.mm_amount, 'shop_purchase', v_offer.offer_id, v_op_key);
  end if;

  if v_offer.mining_multiplier > 1 and v_offer.mining_duration_hours > 0 then
    select b.expires_at into v_new_expires from public.make_money_boosts b where b.player_id = v_player;
    if v_new_expires is null or v_new_expires <= now() then v_new_expires := now(); end if;
    v_new_expires := v_new_expires + make_interval(hours => v_offer.mining_duration_hours);
    v_new_multiplier := v_offer.mining_multiplier;
    insert into public.make_money_boosts(player_id, mining_multiplier, expires_at, updated_at)
    values (v_player, v_new_multiplier, v_new_expires, now())
    on conflict (player_id) do update set
      mining_multiplier = greatest(public.make_money_boosts.mining_multiplier, excluded.mining_multiplier),
      expires_at = excluded.expires_at,
      updated_at = now();
  else
    v_new_multiplier := null; v_new_expires := null;
  end if;

  select p.balance into v_balance from public.make_money_players p where p.id = v_player;
  return query select true, false, v_player, v_offer.offer_id, v_offer.mm_amount, v_balance, coalesce(v_new_multiplier,1), v_new_expires;
end;
$function$;

-- Lock the granting function down to service_role only (the webhook edge
-- function). Nothing else -- anon, authenticated, or PUBLIC -- may call it.
revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from public;
revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from anon;
revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from authenticated;
grant execute on function public.make_money_shop_grant_purchase(text, text, bigint, integer) to service_role;
