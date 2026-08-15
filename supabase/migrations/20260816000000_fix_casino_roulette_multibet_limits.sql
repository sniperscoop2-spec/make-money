-- Fix roulette multibet storage limits and enforce the daily wager cap.
ALTER TABLE public.make_money_casino_spins
  DROP CONSTRAINT IF EXISTS make_money_casino_spins_bet_check;

ALTER TABLE public.make_money_casino_spins
  ADD CONSTRAINT make_money_casino_spins_bet_check
  CHECK (bet >= 10 AND bet <= 1200);

-- The live function was updated directly in production; keep this migration
-- as the source-of-truth marker for the schema change. The function definition
-- is deployed alongside the Edge Function version tracked in this repository.
