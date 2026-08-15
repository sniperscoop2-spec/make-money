insert into public.make_money_real_estate_catalog (property_id,name,property_type,price,income_per_day,cooldown_seconds,active)
values
  ('cafe','Neighborhood Cafe','business',25.0000,0.5000,86400,true),
  ('studio','City Studio','property',100.0000,2.0000,86400,true),
  ('market','Local Market','business',500.0000,10.0000,86400,true)
on conflict (property_id) do update set
  name=excluded.name,
  property_type=excluded.property_type,
  price=excluded.price,
  income_per_day=excluded.income_per_day,
  cooldown_seconds=excluded.cooldown_seconds,
  active=excluded.active;
