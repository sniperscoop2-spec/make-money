alter table public.make_money_casino_spins drop constraint if exists make_money_casino_spins_choice_check;

alter table public.make_money_casino_spins
  add constraint make_money_casino_spins_choice_check check (
    choice ~ '^(red|black|odd|even|low|high|dozen1|dozen2|dozen3|column1|column2|column3)(,(red|black|odd|even|low|high|dozen1|dozen2|dozen3|column1|column2|column3))*$'
  );
