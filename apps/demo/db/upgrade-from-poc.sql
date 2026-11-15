-- Removes what earlier versions created under other names or signatures. Safe to re-run; a fresh database has none of it.
DROP TRIGGER IF EXISTS orders_count_insert ON orders;
DROP TRIGGER IF EXISTS orders_count_delete ON orders;
DROP TRIGGER IF EXISTS orders_count_status_change ON orders;
DROP FUNCTION IF EXISTS orders_count_insert();
DROP FUNCTION IF EXISTS orders_count_delete();
DROP FUNCTION IF EXISTS orders_count_status_change();
DROP FUNCTION IF EXISTS bump_order_status_count(text, integer);
DROP FUNCTION IF EXISTS order_status_counts_bump(text, bigint, bigint);
DROP INDEX IF EXISTS orders_qs_trgm_customer_name;
