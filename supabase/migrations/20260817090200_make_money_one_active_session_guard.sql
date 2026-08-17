with ranked as (
  select token_hash,
         row_number() over(partition by player_id order by expires_at desc, created_at desc) rn
  from public.make_money_sessions
  where revoked_at is null
)
update public.make_money_sessions s
set revoked_at=now()
from ranked r
where s.token_hash=r.token_hash and r.rn>1;

create unique index if not exists make_money_sessions_one_active_player_idx
  on public.make_money_sessions (player_id)
  where revoked_at is null;
