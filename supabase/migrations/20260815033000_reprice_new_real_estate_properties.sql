insert into public.make_money_real_estate_catalog (property_id,name,property_type,price,income_per_day,cooldown_seconds,active)
values
  ('cafe','Neighborhood Cafe','business',1000.0000,20.0000,86400,true),
  ('studio','City Studio','property',5000.0000,100.0000,86400,true),
  ('market','Local Market','business',15000.0000,350.0000,86400,true)
on conflict (property_id) do update set
  price=excluded.price,
  income_per_day=excluded.income_per_day,
  cooldown_seconds=excluded.cooldown_seconds,
  active=excluded.active;
