-- Generated from the orders grid def. One index per declared query shape, then the counter table and its triggers. Safe to re-run.
-- Run each statement on its own, outside a transaction: an index is built CONCURRENTLY, and the counter steps open their own transactions.
-- The quick filter needs trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- no filter, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_created_at ON orders USING btree (created_at, id);
-- no filter, sort total (range on total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_total ON orders USING btree (total, id);
-- status_code =, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_status_code__created_at ON orders USING btree (status_code, created_at, id);
-- status_code =, sort total (range on total)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_status_code__total ON orders USING btree (status_code, total, id);
-- customer_id =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_customer_id__created_at ON orders USING btree (customer_id, created_at, id);
-- region =, sort created_at (range on created_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_region__created_at ON orders USING btree (region, created_at, id);
-- channel =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_channel__created_at ON orders USING btree (channel, created_at, id);
-- status_code =, region =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_status_code__region__created_at ON orders USING btree (status_code, region, created_at, id);
-- status_code =, channel =, sort created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_status_code__channel__created_at ON orders USING btree (status_code, channel, created_at, id);
-- quick filter over customer_name, order_number
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_qs_quick ON orders USING gin ((customer_name || ' ' || order_number::text) gin_trgm_ops);
-- Counter table for status_code and the sum of total: install the triggers, logging each change to order_status_counts_pending. The table lock is held only for the trigger swap.
BEGIN;
CREATE TABLE IF NOT EXISTS order_status_counts (status_code text PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0);
ALTER TABLE order_status_counts ADD COLUMN IF NOT EXISTS total_sum bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS order_status_counts_pending (status_code text NOT NULL, row_count bigint NOT NULL, total_sum bigint NOT NULL);
CREATE OR REPLACE FUNCTION order_status_counts_bump(p_value text, p_rows bigint, p_sum bigint) RETURNS void LANGUAGE sql AS $$
  INSERT INTO order_status_counts_pending (status_code, row_count, total_sum) VALUES (p_value, p_rows, p_sum);
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(NEW.status_code, 1, NEW.total);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(OLD.status_code, -1, -OLD.total);
  RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION order_status_counts_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_status_counts_bump(OLD.status_code, -1, -OLD.total);
  PERFORM order_status_counts_bump(NEW.status_code, 1, NEW.total);
  RETURN NULL;
END;
$$;
LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS order_status_counts_on_insert ON orders;
DROP TRIGGER IF EXISTS order_status_counts_on_delete ON orders;
DROP TRIGGER IF EXISTS order_status_counts_on_update ON orders;
CREATE TRIGGER order_status_counts_on_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION order_status_counts_on_insert();
CREATE TRIGGER order_status_counts_on_delete AFTER DELETE ON orders FOR EACH ROW EXECUTE FUNCTION order_status_counts_on_delete();
CREATE TRIGGER order_status_counts_on_update AFTER UPDATE OF status_code, total ON orders FOR EACH ROW WHEN (OLD.status_code IS DISTINCT FROM NEW.status_code OR OLD.total IS DISTINCT FROM NEW.total) EXECUTE FUNCTION order_status_counts_on_update();
COMMIT;
-- Backfill order_status_counts from one snapshot of orders, with no table lock. Changes logged before the snapshot are already in it and are discarded; later ones stay in order_status_counts_pending.
BEGIN ISOLATION LEVEL REPEATABLE READ;
UPDATE order_status_counts SET row_count = 0, total_sum = 0;
INSERT INTO order_status_counts (status_code, row_count, total_sum)
  SELECT status_code, count(*), coalesce(sum(total), 0) FROM orders GROUP BY status_code
  ON CONFLICT (status_code) DO UPDATE SET row_count = EXCLUDED.row_count, total_sum = EXCLUDED.total_sum;
DELETE FROM order_status_counts_pending;
COMMIT;
-- Fold the changes logged during the backfill into order_status_counts and switch the triggers to write there directly. The table lock is held only for the fold.
BEGIN;
LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO order_status_counts (status_code, row_count, total_sum)
  SELECT status_code, sum(row_count), sum(total_sum) FROM order_status_counts_pending GROUP BY status_code
  ON CONFLICT (status_code) DO UPDATE SET row_count = order_status_counts.row_count + EXCLUDED.row_count, total_sum = order_status_counts.total_sum + EXCLUDED.total_sum;
CREATE OR REPLACE FUNCTION order_status_counts_bump(p_value text, p_rows bigint, p_sum bigint) RETURNS void LANGUAGE sql AS $$
  INSERT INTO order_status_counts (status_code, row_count, total_sum) VALUES (p_value, p_rows, p_sum)
  ON CONFLICT (status_code) DO UPDATE SET row_count = order_status_counts.row_count + EXCLUDED.row_count, total_sum = order_status_counts.total_sum + EXCLUDED.total_sum;
$$;
DROP TABLE order_status_counts_pending;
COMMIT;
