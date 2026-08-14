begin;

-- Mega Miner was 100,000 MM for 160 MM/hour (625h payback), making it
-- mathematically unattractive compared with both neighboring and later tiers.
-- 20,000 MM gives 125h payback: still a meaningful progression step while
-- preserving Quantum as the more efficient high-tier upgrade.
update public.make_money_mining_catalog
set cost=20000, updated_at=now()
where level=5 and name='Mega Miner' and rate_per_hour=160;

commit;
