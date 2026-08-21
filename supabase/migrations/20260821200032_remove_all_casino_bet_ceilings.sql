-- No betting limits at the casino (explicit user request). Blackjack was
-- already raised in the split/double migration; slots (10-100) and
-- roulette (its stored total bet, 10-1200) are raised the same way, to a
-- generous safety ceiling that only guards against numeric overflow, not
-- real play. The RPC functions themselves have no upper-bound logic (only
-- a >=10 floor), so the table CHECK constraints were the only real caps.
alter table public.make_money_casino_slots_spins
  drop constraint if exists make_money_casino_slots_spins_bet_check;
alter table public.make_money_casino_slots_spins
  add constraint make_money_casino_slots_spins_bet_check check (bet >= 10 and bet <= 1000000000000);

alter table public.make_money_casino_spins
  drop constraint if exists make_money_casino_spins_bet_check;
alter table public.make_money_casino_spins
  add constraint make_money_casino_spins_bet_check check (bet >= 10 and bet <= 1000000000000);
