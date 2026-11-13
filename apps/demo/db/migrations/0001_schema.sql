CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS order_statuses (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_transitions (
  from_code text NOT NULL REFERENCES order_statuses (code),
  to_code text NOT NULL REFERENCES order_statuses (code),
  PRIMARY KEY (from_code, to_code)
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  seq integer NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  region text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  order_number bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_code text NOT NULL REFERENCES order_statuses (code),
  customer_id uuid NOT NULL REFERENCES customers (id),
  customer_name text NOT NULL,
  region text NOT NULL,
  channel text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  currency text NOT NULL DEFAULT 'ZAR',
  total bigint NOT NULL,
  item_count integer NOT NULL,
  paid_at timestamptz,
  shipped_at timestamptz,
  note text
);

CREATE INDEX IF NOT EXISTS customers_name_trgm ON customers USING gin (name gin_trgm_ops);
