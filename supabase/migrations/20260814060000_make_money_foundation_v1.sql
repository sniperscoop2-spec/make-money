-- Make Money Telegram Mini App foundation V1
-- Applied to Supabase as migration: make_money_foundation_v1
-- This migration intentionally does not modify or delete the legacy game_accounts/game_sessions system.

create table if not exists public.make_money_players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  balance numeric(30,4) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.make_money_mining (
  player_id uuid primary key references public.make_money_players(id) on delete cascade,
  miner_level integer not null default 1 check (miner_level >= 1),
  mining_rate numeric(30,4) not null default 1 check (mining_rate >= 0),
  last_claim_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.make_money_inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  item_id text not null,
  quantity integer not null default 1 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(player_id, item_id)
);

create table if not exists public.make_money_properties (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  property_id text not null,
  purchased_at timestamptz not null default now(),
  unique(player_id, property_id)
);

create table if not exists public.make_money_jobs (
  player_id uuid primary key references public.make_money_players(id) on delete cascade,
  job_id text,
  level integer not null default 1 check (level >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists public.make_money_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  type text not null,
  amount numeric(30,4) not null,
  balance_before numeric(30,4) not null check (balance_before >= 0),
  balance_after numeric(30,4) not null check (balance_after >= 0),
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists make_money_players_balance_idx on public.make_money_players (balance desc);
create index if not exists make_money_transactions_player_created_idx on public.make_money_transactions (player_id, created_at desc);
create index if not exists make_money_inventory_player_idx on public.make_money_inventory (player_id);
create index if not exists make_money_properties_player_idx on public.make_money_properties (player_id);

alter table public.make_money_players enable row level security;
alter table public.make_money_mining enable row level security;
alter table public.make_money_inventory enable row level security;
alter table public.make_money_properties enable row level security;
alter table public.make_money_jobs enable row level security;
alter table public.make_money_transactions enable row level security;

create or replace function public.make_money_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists make_money_players_updated_at on public.make_money_players;
create trigger make_money_players_updated_at before update on public.make_money_players for each row execute function public.make_money_set_updated_at();

drop trigger if exists make_money_mining_updated_at on public.make_money_mining;
create trigger make_money_mining_updated_at before update on public.make_money_mining for each row execute function public.make_money_set_updated_at();

drop trigger if exists make_money_inventory_updated_at on public.make_money_inventory;
create trigger make_money_inventory_updated_at before update on public.make_money_inventory for each row execute function public.make_money_set_updated_at();

drop trigger if exists make_money_jobs_updated_at on public.make_money_jobs;
create trigger make_money_jobs_updated_at before update on public.make_money_jobs for each row execute function public.make_money_set_updated_at();

revoke all on table public.make_money_players, public.make_money_mining, public.make_money_inventory, public.make_money_properties, public.make_money_jobs, public.make_money_transactions from anon, authenticated;
revoke all on function public.make_money_set_updated_at() from public, anon, authenticated;
