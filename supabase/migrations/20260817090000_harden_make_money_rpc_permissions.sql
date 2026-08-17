-- Harden internal Make Money helper RPCs.
-- These functions are called only by SECURITY DEFINER functions / Edge Functions
-- and must not be directly executable through the public PostgREST API.
revoke all on function public.make_money_get_job_progress(text) from public, anon, authenticated;
revoke all on function public.make_money_get_real_estate(text) from public, anon, authenticated;
revoke all on function public.make_money_real_estate_market_change(text, timestamptz) from public, anon, authenticated;
revoke all on function public.make_money_real_estate_market_price(text, timestamptz) from public, anon, authenticated;
revoke all on function public.make_money_apply_transaction(uuid, numeric, text, text, text) from public, anon, authenticated;
