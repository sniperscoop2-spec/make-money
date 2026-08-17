begin;
create or replace function public.make_money_inventory_sell(p_session_hash text,p_item_id text,p_quantity integer,p_operation_key text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare pid uuid; qty integer; unit numeric; total numeric; bal numeric; existing numeric; typ text;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 if p_item_id is null or p_item_id !~ '^case(50|500|5000|50000|500000)_[a-z0-9_-]+$' then raise exception 'invalid_item'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'invalid_quantity'; end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
 select player_id into pid from public.make_money_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() limit 1; if pid is null then raise exception 'invalid_or_expired_session'; end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':inventory-sell:'||p_operation_key,0));
 select amount,operation_type into existing,typ from public.make_money_idempotency where player_id=pid and operation_key=p_operation_key;
 if found then if typ<>'inventory_sell' then raise exception 'operation_key_reused'; end if; return jsonb_build_object('sold_quantity',0,'value',existing,'balance',(select balance from public.make_money_players where id=pid),'duplicate',true); end if;
 select i.quantity,c.sell_value into qty,unit from public.make_money_inventory i join public.make_money_item_catalog c on c.item_id=i.item_id where i.player_id=pid and i.item_id=p_item_id and c.active and c.item_id like 'case%' for update;
 if qty is null then raise exception 'item_not_found'; end if; if qty<p_quantity then raise exception 'insufficient_items'; end if;
 total:=unit*p_quantity; select balance into bal from public.make_money_players where id=pid for update;
 update public.make_money_inventory set quantity=quantity-p_quantity,updated_at=now() where player_id=pid and item_id=p_item_id;
 update public.make_money_players set balance=balance+total,updated_at=now() where id=pid returning balance into bal;
 insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(pid,p_operation_key,'inventory_sell',total);
 insert into public.make_money_transactions(player_id,type,amount,balance_before,balance_after,reference,metadata) values(pid,'inventory_sell',total,bal-total,bal,p_operation_key,jsonb_build_object('item_id',p_item_id,'quantity',p_quantity,'unit_value',unit));
 return jsonb_build_object('sold_quantity',p_quantity,'value',total,'balance',bal,'duplicate',false);
end; $$;
create or replace function public.make_money_inventory_sell_all(p_session_hash text,p_operation_key text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare pid uuid; total numeric; bal numeric; existing numeric; typ text;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session'; end if;
 if p_operation_key is null or p_operation_key !~ '^[A-Za-z0-9_-]{16,128}$' then raise exception 'invalid_operation_key'; end if;
 select player_id into pid from public.make_money_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() limit 1; if pid is null then raise exception 'invalid_or_expired_session'; end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text||':inventory-sell-all:'||p_operation_key,0));
 select amount,operation_type into existing,typ from public.make_money_idempotency where player_id=pid and operation_key=p_operation_key;
 if found then if typ<>'inventory_sell_all' then raise exception 'operation_key_reused'; end if; return jsonb_build_object('value',existing,'balance',(select balance from public.make_money_players where id=pid),'duplicate',true); end if;
 select coalesce(sum(i.quantity*c.sell_value),0) into total from public.make_money_inventory i join public.make_money_item_catalog c on c.item_id=i.item_id where i.player_id=pid and c.active and c.item_id like 'case%';
 select balance into bal from public.make_money_players where id=pid for update;
 update public.make_money_inventory i set quantity=0,updated_at=now() from public.make_money_item_catalog c where i.player_id=pid and i.item_id=c.item_id and c.active and c.item_id like 'case%';
 update public.make_money_players set balance=balance+total,updated_at=now() where id=pid returning balance into bal;
 insert into public.make_money_idempotency(player_id,operation_key,operation_type,amount) values(pid,p_operation_key,'inventory_sell_all',total);
 insert into public.make_money_transactions(player_id,type,amount,balance_before,balance_after,reference,metadata) values(pid,'inventory_sell_all',total,bal-total,bal,p_operation_key,jsonb_build_object('total_value',total));
 return jsonb_build_object('value',total,'balance',bal,'duplicate',false);
end; $$;
revoke all on function public.make_money_inventory_sell(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.make_money_inventory_sell_all(text,text) from public,anon,authenticated;

do $$ declare pid uuid; bal numeric; tx numeric;
begin select id,balance into pid,bal from public.make_money_players order by created_at,id limit 1; select coalesce(sum(amount),0) into tx from public.make_money_transactions where player_id=pid; if pid is not null and round(bal-tx,4)=750 then insert into public.make_money_transactions(player_id,type,amount,balance_before,balance_after,reference,metadata) values(pid,'opening_balance',750,0,750,'genesis_20260814',jsonb_build_object('reason','reconcile_pre_ledger_starting_balance')); end if; end $$;
commit;
