alter table public.make_money_casino_blackjack_rounds
  drop constraint if exists make_money_casino_blackjack_rounds_bet_check;
alter table public.make_money_casino_blackjack_rounds
  add constraint make_money_casino_blackjack_rounds_bet_check check (bet >= 10 and bet <= 1000000000000);
