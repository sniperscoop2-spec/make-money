-- Remove the redundant UNIQUE index; the table constraint already provides
-- the same (player_id, item_id) uniqueness.
drop index if exists public.make_money_inventory_player_item_uidx;

-- Add covering indexes for Make Money foreign keys that were missing one.
create index if not exists make_money_achievements_achievement_idx
  on public.make_money_achievements (achievement_id);
create index if not exists make_money_box_drops_item_idx
  on public.make_money_box_drops (item_id);
create index if not exists make_money_crypto_holdings_asset_idx
  on public.make_money_crypto_holdings (asset_id);
create index if not exists make_money_crypto_trades_asset_idx
  on public.make_money_crypto_trades (asset_id);
create index if not exists make_money_job_state_job_idx
  on public.make_money_job_state (job_id);
create index if not exists make_money_real_estate_state_property_idx
  on public.make_money_real_estate_state (property_id);
