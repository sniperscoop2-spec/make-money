create extension if not exists pgcrypto;

create table if not exists public.make_money_idempotency (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.make_money_players(id) on delete cascade,
  operation_key text not null,
  operation_type text not null,
  amount numeric(20,4) not null,
  created_at timestamptz not null default now(),
  unique (player_id, operation_key)
);

create index if not exists make_money_idempotency_player_created_idx
  on public.make_money_idempotency(player_id, created_at desc);

alter table public.make_money_idempotency enable row level security;
revoke all on public.make_money_idempotency from anon, authenticated;

create or replace function public.make_money_apply_transaction(
  p_player_id uuid,
  p_amount numeric,
  p_type text,
  p_reference text default null,
  p_operation_key text default null
)
returns table(new_balance numeric, transaction_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance numeric(20,4);
  v_tx uuid;
  v_existing_amount numeric(20,4);
begin
  if p_player_id is null or p_amount is null or p_type is null or btrim(p_type) = '' then
    raise exception 'invalid_transaction';
  end if;
  if p_amount = 0 or abs(p_amount) > 1000000000000 then
    raise exception 'invalid_amount';
  end if;
  if p_operation_key is null or length(p_operation_key) < 8 or length(p_operation_key) > 128 then
    raise exception 'operation_key_required';
  end if;

  select balance into v_balance
  from public.make_money_players
  where id = p_player_id
  for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select amount into v_existing_amount
  from public.make_money_idempotency
  where player_id = p_player_id and operation_key = p_operation_key;

  if found then
    if v_existing_amount <> p_amount then
      raise exception 'operation_key_reused';
    end if;
    return query select v_balance, null::uuid, true;
    return;
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'insufficient_balance';
  end if;

  update public.make_money_players
  set balance = v_balance + p_amount, updated_at = now()
  where id = p_player_id;

  insert into public.make_money_transactions(
    player_id, type, amount, balance_before, balance_after, reference
  )
  values (
    p_player_id, p_type, p_amount, v_balance, v_balance + p_amount, p_reference
  )
  returning id into v_tx;

  insert into public.make_money_idempotency(
    player_id, operation_key, operation_type, amount
  )
  values (
    p_player_id, p_operation_key, p_type, p_amount
  );

  return query select v_balance + p_amount, v_tx, false;
end;
$$;

revoke all on function public.make_money_apply_transaction(uuid,numeric,text,text,text)
  from public, anon, authenticated;
