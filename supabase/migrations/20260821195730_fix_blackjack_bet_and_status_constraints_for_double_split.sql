-- The bet check (10-100) predates the "unlimited casino wagering" migrations
-- that already raised roulette's cap to 1200; blackjack was left behind at
-- 100, which breaks double() the moment someone doubles a 100 MM bet
-- (100*2=200 > 100). Match the wagering-is-unlimited intent already applied
-- elsewhere, with a generous safety ceiling against pathological overflow.
alter table public.make_money_casino_blackjack_rounds
  drop constraint if exists make_money_casino_blackjack_rounds_bet_check;
alter table public.make_money_casino_blackjack_rounds
  add constraint make_money_casino_blackjack_rounds_bet_check check (bet >= 10 and bet <= 100000000);

-- 'standing' is a new interim per-hand state used while a split round still
-- has one hand to act on but the other is done acting (bust or stood),
-- distinct from 'active' (still hittable) and the final settled outcomes.
alter table public.make_money_casino_blackjack_rounds
  drop constraint if exists make_money_casino_blackjack_rounds_status_check;
alter table public.make_money_casino_blackjack_rounds
  add constraint make_money_casino_blackjack_rounds_status_check
  check (status = any (array['active','standing','won','lost','push','blackjack']));
