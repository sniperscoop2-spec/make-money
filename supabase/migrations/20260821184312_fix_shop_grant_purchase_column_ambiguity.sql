-- Fix: RETURNS TABLE column names (player_id, offer_id, mm_granted, boost_multiplier)
-- shadowed real table columns referenced in bare INSERT/ON CONFLICT column
-- lists inside the function body, causing "column reference is ambiguous".
-- Same bug class as several earlier make_money_* ambiguity fixes; renaming
-- the OUT columns with an r_ prefix removes the whole collision class.
-- (Caught by direct SQL testing before this ever reached the edge function.)
drop function if exists public.make_money_shop_grant_purchase(text, text, bigint, integer);

create function public.make_money_shop_grant_purchase(
  p_invoice_payload text,
  p_telegram_charge_id text,
  p_telegram_user_id bigint,
  p_stars_amount integer
)
returns table(r_ok boolean, r_duplicate boolean, r_player_id uuid, r_offer_id text, r_mm_granted numeric, r_new_balance numeric, r_boost_multiplier numeric, r_boost_expires_at timestamp with time zone)
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

revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from public;
revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from anon;
revoke all on function public.make_money_shop_grant_purchase(text, text, bigint, integer) from authenticated;
grant execute on function public.make_money_shop_grant_purchase(text, text, bigint, integer) to service_role;
