insert into public.make_money_achievement_catalog (achievement_id,name,description,reward,sort_order,active) values
('first_case','📦 Case Opener','Open your first case.',75,80,true),
('first_crypto_trade','🚀 Crypto Trader','Complete your first crypto trade.',75,90,true),
('ten_mining_claims','⛏️ Mining Veteran','Claim mining rewards 10 times.',150,100,true),
('item_collector','🎒 Item Collector','Own at least 10 items in your inventory.',300,110,true),
('property_investor','🏢 Property Investor','Own at least 3 property units.',750,120,true)
on conflict (achievement_id) do update set name=excluded.name,description=excluded.description,reward=excluded.reward,sort_order=excluded.sort_order,active=excluded.active;

-- The deployed achievement RPCs are updated by the corresponding production migration.
-- Conditions:
-- first_case: at least one case operation
-- first_crypto_trade: at least one crypto trade
-- ten_mining_claims: at least 10 mining_claim ledger transactions
-- item_collector: at least 10 inventory units
-- property_investor: at least 3 property units
