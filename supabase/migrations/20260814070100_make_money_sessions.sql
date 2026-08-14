create table if not exists public.make_money_sessions (
  token_hash text primary key,
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);
create index if not exists make_money_sessions_player_idx on public.make_money_sessions(player_id);
create index if not exists make_money_sessions_expires_idx on public.make_money_sessions(expires_at);
alter table public.make_money_sessions enable row level security;
revoke all on public.make_money_sessions from anon, authenticated;
