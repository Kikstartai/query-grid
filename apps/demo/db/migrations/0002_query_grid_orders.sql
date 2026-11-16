-- Generated from the orders grid def. One CREATE INDEX per declared index, then the counter table and its triggers. Safe to re-run, whole or from the step that failed.
-- Run each statement on its own, outside a transaction: an index is built CONCURRENTLY, and the counter steps open their own transactions.
-- The search and the text indexes are trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- no filter, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_created_at ON orders USING btree (created_at, id);
-- Mark auto_orders_created_at as auto-created.
COMMENT ON INDEX auto_orders_created_at IS 'Auto-created.';
-- no filter, sort total (range on total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_total ON orders USING btree (total, id);
-- Mark auto_orders_total as auto-created.
COMMENT ON INDEX auto_orders_total IS 'Auto-created.';
-- status_code =, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_status_code__created_at ON orders USING btree (status_code, created_at, id);
-- Mark auto_orders_status_code__created_at as auto-created.
COMMENT ON INDEX auto_orders_status_code__created_at IS 'Auto-created.';
-- status_code =, sort total (range on total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_status_code__total ON orders USING btree (status_code, total, id);
-- Mark auto_orders_status_code__total as auto-created.
COMMENT ON INDEX auto_orders_status_code__total IS 'Auto-created.';
-- customer_id =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_customer_id__created_at ON orders USING btree (customer_id, created_at, id);
-- Mark auto_orders_customer_id__created_at as auto-created.
COMMENT ON INDEX auto_orders_customer_id__created_at IS 'Auto-created.';
-- region =, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_region__created_at ON orders USING btree (region, created_at, id);
-- Mark auto_orders_region__created_at as auto-created.
COMMENT ON INDEX auto_orders_region__created_at IS 'Auto-created.';
-- channel =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_channel__created_at ON orders USING btree (channel, created_at, id);
-- Mark auto_orders_channel__created_at as auto-created.
COMMENT ON INDEX auto_orders_channel__created_at IS 'Auto-created.';
-- assignee =, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_assignee__created_at ON orders USING btree (assignee, created_at, id);
-- Mark auto_orders_assignee__created_at as auto-created.
COMMENT ON INDEX auto_orders_assignee__created_at IS 'Auto-created.';
-- status_code =, region =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_status_code__region__created_at ON orders USING btree (status_code, region, created_at, id);
-- Mark auto_orders_status_code__region__created_at as auto-created.
COMMENT ON INDEX auto_orders_status_code__region__created_at IS 'Auto-created.';
-- status_code =, channel =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_status_code__channel__created_at ON orders USING btree (status_code, channel, created_at, id);
-- Mark auto_orders_status_code__channel__created_at as auto-created.
COMMENT ON INDEX auto_orders_status_code__channel__created_at IS 'Auto-created.';
-- no filter, sort item_count, then total
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_item_count__total ON orders USING btree (item_count, total, id);
-- Mark auto_orders_item_count__total as auto-created.
COMMENT ON INDEX auto_orders_item_count__total IS 'Auto-created.';
-- search over customer_name, order_number
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_search ON orders USING gin ((customer_name || ' ' || order_number::text) gin_trgm_ops);
-- Mark auto_orders_search as auto-created.
COMMENT ON INDEX auto_orders_search IS 'Auto-created.';
-- text match on customer_name
CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_orders_customer_name_trgm ON orders USING gin (customer_name gin_trgm_ops);
-- Mark auto_orders_customer_name_trgm as auto-created.
COMMENT ON INDEX auto_orders_customer_name_trgm IS 'Auto-created.';
-- Counter table for status_code and the sum of total and the sum of item_count: install the triggers. They keep order_status_counts current and also log each change to order_status_counts_pending. The table lock is taken first, so no write is half way through a trigger while the counter objects change, and is held only for this short step. The pending table starts empty, so a count taken before this step no longer stands: the switch waits for a new one.
BEGIN;
LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS order_status_counts (status_code text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);
ALTER TABLE order_status_counts ADD COLUMN IF NOT EXISTS total_sum bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS item_count_sum bigint NOT NULL DEFAULT 0;
DROP TABLE IF EXISTS order_status_counts_pending;
CREATE TABLE order_status_counts_pending (status_code text NOT NULL, row_count bigint NOT NULL, total_sum bigint NOT NULL, item_count_sum bigint NOT NULL);
DROP FUNCTION IF EXISTS order_status_counts_bump(text, bigint, bigint);
CREATE OR REPLACE FUNCTION order_status_counts_bump(p_value text, p_rows bigint, p_sums bigint[]) RETURNS void LANGUAGE sql AS $$
  INSERT INTO order_status_counts (status_code, row_count, total_sum, item_count_sum) VALUES (p_value, p_rows, p_sums[1], p_sums[2])
  ON CONFLICT (status_code) DO UPDATE SET row_count = order_status_counts.row_count + EXCLUDED.row_count, total_sum = order_status_counts.total_sum + EXCLUDED.total_sum, item_count_sum = order_status_counts.item_count_sum + EXCLUDED.item_count_sum;
  INSERT INTO order_status_counts_pending (status_code, row_count, total_sum, item_count_sum) VALUES (p_value, p_rows, p_sums[1], p_sums[2]);
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(NEW.status_code, 1, ARRAY[NEW.total, NEW.item_count]::bigint[]);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(OLD.status_code, -1, ARRAY[-OLD.total, -OLD.item_count]::bigint[]);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(OLD.status_code, -1, ARRAY[-OLD.total, -OLD.item_count]::bigint[]);
  PERFORM order_status_counts_bump(NEW.status_code, 1, ARRAY[NEW.total, NEW.item_count]::bigint[]);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS order_status_counts_on_insert ON orders;
DROP TRIGGER IF EXISTS order_status_counts_on_delete ON orders;
DROP TRIGGER IF EXISTS order_status_counts_on_update ON orders;
CREATE TRIGGER order_status_counts_on_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION order_status_counts_on_insert();
CREATE TRIGGER order_status_counts_on_delete AFTER DELETE ON orders FOR EACH ROW EXECUTE FUNCTION order_status_counts_on_delete();
CREATE TRIGGER order_status_counts_on_update AFTER UPDATE OF status_code, total, item_count ON orders FOR EACH ROW WHEN (OLD.status_code IS DISTINCT FROM NEW.status_code OR OLD.total IS DISTINCT FROM NEW.total OR OLD.item_count IS DISTINCT FROM NEW.item_count) EXECUTE FUNCTION order_status_counts_on_update();
COMMIT;
-- Count orders from one snapshot into order_status_counts_pending, with no table lock. Changes logged before the snapshot are in the count and are discarded; later ones stay beside it. Does nothing once order_status_counts_pending is gone.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $backfill$
BEGIN
  IF to_regclass('order_status_counts_pending') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM order_status_counts_pending;
  INSERT INTO order_status_counts_pending (status_code, row_count, total_sum, item_count_sum)
    SELECT status_code, count(*), coalesce(sum(total), 0), coalesce(sum(item_count), 0) FROM orders GROUP BY status_code;
  COMMENT ON TABLE order_status_counts_pending IS 'backfilled';
END
$backfill$;
COMMIT;
-- Replace order_status_counts with the count plus the changes logged since, and switch the triggers to write there only. The table lock is held only for this. Does nothing once order_status_counts_pending is gone, and refuses to run before the count.
DO $switch$
BEGIN
  IF to_regclass('order_status_counts_pending') IS NULL THEN
    RETURN;
  END IF;
  IF obj_description(to_regclass('order_status_counts_pending'), 'pg_class') IS DISTINCT FROM 'backfilled' THEN
    RAISE EXCEPTION 'order_status_counts_pending holds no backfill: run the backfill step first';
  END IF;
  LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE;
  UPDATE order_status_counts SET row_count = 0, total_sum = 0, item_count_sum = 0;
  INSERT INTO order_status_counts (status_code, row_count, total_sum, item_count_sum)
    SELECT status_code, sum(row_count), sum(total_sum), sum(item_count_sum) FROM order_status_counts_pending GROUP BY status_code
    ON CONFLICT (status_code) DO UPDATE SET row_count = EXCLUDED.row_count, total_sum = EXCLUDED.total_sum, item_count_sum = EXCLUDED.item_count_sum;
  CREATE OR REPLACE FUNCTION order_status_counts_bump(p_value text, p_rows bigint, p_sums bigint[]) RETURNS void LANGUAGE sql AS $bump$
  INSERT INTO order_status_counts (status_code, row_count, total_sum, item_count_sum) VALUES (p_value, p_rows, p_sums[1], p_sums[2])
  ON CONFLICT (status_code) DO UPDATE SET row_count = order_status_counts.row_count + EXCLUDED.row_count, total_sum = order_status_counts.total_sum + EXCLUDED.total_sum, item_count_sum = order_status_counts.item_count_sum + EXCLUDED.item_count_sum;
$bump$;
  DROP TABLE order_status_counts_pending;
END
$switch$;
