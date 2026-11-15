-- Removes what the proof of concept created under other names. Safe to re-run; a fresh database has none of it.
DROP TRIGGER IF EXISTS orders_count_insert ON orders;
DROP TRIGGER IF EXISTS orders_count_delete ON orders;
DROP TRIGGER IF EXISTS orders_count_status_change ON orders;
DROP FUNCTION IF EXISTS orders_count_insert();
DROP FUNCTION IF EXISTS orders_count_delete();
DROP FUNCTION IF EXISTS orders_count_status_change();
DROP FUNCTION IF EXISTS bump_order_status_count(text, integer);
DROP INDEX IF EXISTS orders_qs_trgm_customer_name;
-- Indexes built before the auto_ prefix keep their data and take the generated name, so the migration does not build each one a second time.
ALTER INDEX IF EXISTS orders_qs_created_at RENAME TO auto_orders_created_at;
ALTER INDEX IF EXISTS orders_qs_total RENAME TO auto_orders_total;
ALTER INDEX IF EXISTS orders_qs_status_code__created_at RENAME TO auto_orders_status_code__created_at;
ALTER INDEX IF EXISTS orders_qs_status_code__total RENAME TO auto_orders_status_code__total;
ALTER INDEX IF EXISTS orders_qs_customer_id__created_at RENAME TO auto_orders_customer_id__created_at;
ALTER INDEX IF EXISTS orders_qs_region__created_at RENAME TO auto_orders_region__created_at;
ALTER INDEX IF EXISTS orders_qs_channel__created_at RENAME TO auto_orders_channel__created_at;
ALTER INDEX IF EXISTS orders_qs_status_code__region__created_at RENAME TO auto_orders_status_code__region__created_at;
ALTER INDEX IF EXISTS orders_qs_status_code__channel__created_at RENAME TO auto_orders_status_code__channel__created_at;
ALTER INDEX IF EXISTS orders_qs_quick RENAME TO auto_orders_search;
