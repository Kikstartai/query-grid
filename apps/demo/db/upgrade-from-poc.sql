-- Removes what the proof of concept created under other names. Safe to re-run; a fresh database has none of it.
DROP TRIGGER IF EXISTS orders_count_insert ON orders;
DROP TRIGGER IF EXISTS orders_count_delete ON orders;
DROP TRIGGER IF EXISTS orders_count_status_change ON orders;
DROP FUNCTION IF EXISTS orders_count_insert();
DROP FUNCTION IF EXISTS orders_count_delete();
DROP FUNCTION IF EXISTS orders_count_status_change();
DROP FUNCTION IF EXISTS bump_order_status_count(text, integer);
DROP INDEX IF EXISTS orders_qs_trgm_customer_name;
-- Indexes built before the auto_ prefix take the generated name, so the migration does not build each one a second time. Where the generated index already stands, the old one is the duplicate and is dropped.
DO $$
DECLARE
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ['orders_qs_created_at', 'auto_orders_created_at'],
    ['orders_qs_total', 'auto_orders_total'],
    ['orders_qs_status_code__created_at', 'auto_orders_status_code__created_at'],
    ['orders_qs_status_code__total', 'auto_orders_status_code__total'],
    ['orders_qs_customer_id__created_at', 'auto_orders_customer_id__created_at'],
    ['orders_qs_region__created_at', 'auto_orders_region__created_at'],
    ['orders_qs_channel__created_at', 'auto_orders_channel__created_at'],
    ['orders_qs_status_code__region__created_at', 'auto_orders_status_code__region__created_at'],
    ['orders_qs_status_code__channel__created_at', 'auto_orders_status_code__channel__created_at'],
    ['orders_qs_quick', 'auto_orders_search']
  ] LOOP
    IF to_regclass(pair[1]) IS NULL THEN
      CONTINUE;
    END IF;
    IF to_regclass(pair[2]) IS NULL THEN
      EXECUTE format('ALTER INDEX %I RENAME TO %I', pair[1], pair[2]);
    ELSE
      EXECUTE format('DROP INDEX %I', pair[1]);
    END IF;
  END LOOP;
END $$;
