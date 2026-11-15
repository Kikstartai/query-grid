import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { listTableMigrations } from "@kikstart/query-grid-postgres";
import { Client } from "pg";

import {
  ORDER_ASSIGNED_SHARE,
  ORDER_ASSIGNEES,
  ORDER_CHANNELS,
  ORDER_PRIORITIES,
  ORDER_REGIONS,
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  type WeightedOption,
} from "../src/core/orders/orders-reference";
import { GRID_DEFS } from "../src/core/grid-defs";

const CUSTOMER_COUNT = Number(process.env.QUERY_GRID_CUSTOMER_COUNT ?? 30_000);
const ORDER_COUNT = Number(process.env.QUERY_GRID_ORDER_COUNT ?? 620_000);
const CUSTOMER_BATCH = 100_000;
const ORDER_BATCH = 250_000;
const SCHEMA = join(import.meta.dir, "migrations", "0001_schema.sql");
const UPGRADE = join(import.meta.dir, "upgrade-from-poc.sql");
const MIGRATE_ONLY = process.argv.includes("--migrate-only");

const FIRST_NAMES = [
  "Thabo",
  "Sipho",
  "Lerato",
  "Nomsa",
  "Zanele",
  "Bongani",
  "Ayanda",
  "Naledi",
  "Kagiso",
  "Palesa",
  "Themba",
  "Lindiwe",
  "Mandla",
  "Busisiwe",
  "Tshepo",
  "Refilwe",
  "Johan",
  "Pieter",
  "Annelie",
  "Willem",
  "Priya",
  "Rajesh",
  "Fatima",
  "Yusuf",
  "Amina",
  "Kwame",
  "Chidi",
  "Ngozi",
  "Wanjiru",
  "Otieno",
  "Grace",
  "David",
  "Sarah",
  "Michael",
  "Emma",
  "James",
  "Olivia",
  "Daniel",
  "Chloe",
  "Liam",
];
const SURNAME_STARTS = [
  "Mok",
  "Nkos",
  "Dlam",
  "Zul",
  "Khum",
  "Mah",
  "Sith",
  "Ndl",
  "Mab",
  "Ngc",
  "Both",
  "Pret",
  "Nai",
  "Pill",
  "Gov",
  "Smi",
  "Jon",
  "Will",
  "Bro",
  "Tay",
  "Dav",
  "Wil",
  "Eva",
  "Tho",
  "Rob",
  "Wal",
  "Wri",
  "Gre",
  "Hal",
  "Woo",
  "Jac",
  "Cla",
  "Pat",
  "Mar",
  "Coo",
  "Mor",
  "Bel",
  "Mur",
  "Bai",
  "Ste",
];
const SURNAME_ENDS = [
  "oena",
  "ana",
  "ini",
  "ulu",
  "alo",
  "langu",
  "ole",
  "ovu",
  "uza",
  "obo",
  "erwe",
  "ha",
  "orius",
  "doo",
  "ay",
  "ender",
  "th",
  "es",
  "iams",
  "wn",
  "lor",
  "ies",
  "son",
  "ns",
  "mas",
  "erts",
  "ker",
  "ght",
  "en",
  "ll",
  "ard",
  "kson",
  "rke",
  "el",
  "tin",
  "per",
  "gan",
  "ton",
  "ray",
  "ley",
];
const NOTES = [
  "Gift wrap requested.",
  "Leave at reception.",
  "Customer asked for a call before delivery.",
  "Fragile.",
  "Second attempt: nobody was home on the first delivery, the neighbour at number 14 will sign for it if the gate is locked again.",
  "Replacement for a damaged item; ship with the returns label inside the box and waive the delivery fee.",
];

function weightedCase(options: WeightedOption[], expression: string): string {
  let cumulative = 0;
  const branches = options.slice(0, -1).map((option) => {
    cumulative += option.weight;
    return `WHEN ${expression} < ${cumulative.toFixed(6)} THEN '${option.value}'`;
  });
  return `CASE ${branches.join(" ")} ELSE '${options[options.length - 1].value}' END`;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function applyFile(client: Client, path: string): Promise<void> {
  const started = Date.now();
  await client.query(readFileSync(path, "utf8"));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`applied ${basename(path)} in ${seconds}s`);
}

async function applyGenerated(client: Client): Promise<void> {
  for (const migration of listTableMigrations(GRID_DEFS)) {
    const started = Date.now();
    for (const step of migration.steps) {
      await client.query(step.sql);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(
      `applied ${migration.steps.length} generated steps to ${migration.table} in ${seconds}s`,
    );
  }
}

async function seedReference(client: Client): Promise<void> {
  for (const [index, status] of ORDER_STATUSES.entries()) {
    await client.query(
      "INSERT INTO order_statuses (code, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING",
      [status.value, status.label, index],
    );
  }
  for (const [from, to] of ORDER_STATUS_TRANSITIONS) {
    await client.query(
      "INSERT INTO order_status_transitions (from_code, to_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [from, to],
    );
  }
}

async function seedCustomers(client: Client): Promise<void> {
  const existing = await client.query<{ max: number | null }>(
    "SELECT max(seq) AS max FROM customers",
  );
  for (
    let start = (existing.rows[0].max ?? 0) + 1;
    start <= CUSTOMER_COUNT;
    start += CUSTOMER_BATCH
  ) {
    const end = Math.min(start + CUSTOMER_BATCH - 1, CUSTOMER_COUNT);
    await client.query(
      `INSERT INTO customers (seq, name, email, region, created_at)
       SELECT r.g,
              r.first_name || ' ' || r.surname,
              lower(r.first_name) || '.' || lower(r.surname) || r.g || '@example.com',
              ${weightedCase(ORDER_REGIONS, "r.region_roll")},
              now() - r.age_roll * interval '1400 days'
       FROM (
         SELECT g,
                ($3::text[])[1 + floor(random() * $4)::int] AS first_name,
                ($5::text[])[1 + floor(power(random(), 2) * $6)::int]
                  || ($7::text[])[1 + floor(power(random(), 2) * $8)::int] AS surname,
                random() AS region_roll,
                random() AS age_roll
         FROM generate_series($1::int, $2::int) g
       ) r`,
      [
        start,
        end,
        FIRST_NAMES,
        FIRST_NAMES.length,
        SURNAME_STARTS,
        SURNAME_STARTS.length,
        SURNAME_ENDS,
        SURNAME_ENDS.length,
      ],
    );
    log(
      `customers ${end.toLocaleString()} / ${CUSTOMER_COUNT.toLocaleString()}`,
    );
  }
}

async function seedOrders(client: Client): Promise<void> {
  const existing = await client.query<{ max: string | null }>(
    "SELECT max(order_number) AS max FROM orders",
  );
  for (
    let start = Number(existing.rows[0].max ?? 0) + 1;
    start <= ORDER_COUNT;
    start += ORDER_BATCH
  ) {
    const end = Math.min(start + ORDER_BATCH - 1, ORDER_COUNT);
    const started = Date.now();
    await client.query(
      `INSERT INTO orders (
         order_number, created_at, updated_at, status_code, customer_id, customer_name,
         region, channel, priority, currency, total, item_count, paid_at, shipped_at, note, assignee
       )
       SELECT r.g,
              r.created_at,
              r.created_at + r.lag_roll * interval '10 days',
              r.status_code,
              c.id,
              c.name,
              CASE WHEN r.home_roll < 0.7 THEN c.region ELSE ${weightedCase(ORDER_REGIONS, "r.region_roll")} END,
              ${weightedCase(ORDER_CHANNELS, "r.channel_roll")},
              ${weightedCase(ORDER_PRIORITIES, "r.priority_roll")},
              'ZAR',
              round(500 + exp(6.5 * r.total_roll) * 100)::bigint,
              1 + floor(power(r.items_roll, 2) * 12)::int,
              CASE WHEN r.status_code IN ('paid', 'shipped', 'completed', 'refunded')
                   THEN r.created_at + r.lag_roll * interval '2 days' END,
              CASE WHEN r.status_code IN ('shipped', 'completed')
                   THEN r.created_at + interval '2 days' + r.lag_roll * interval '5 days' END,
              CASE WHEN r.note_roll < 0.12 THEN ($4::text[])[1 + floor(r.note_pick * $5)::int] END,
              CASE WHEN r.assigned_roll < ${ORDER_ASSIGNED_SHARE} THEN ${weightedCase(ORDER_ASSIGNEES, "r.assignee_roll")} END
       FROM (
         SELECT s.*, ${weightedCase(ORDER_STATUSES, "s.status_roll")} AS status_code
         FROM (
           SELECT g,
                  now() - power(random(), 1.6) * interval '1095 days' AS created_at,
                  1 + floor(power(random(), 3) * $3)::int AS customer_seq,
                  random() AS status_roll, random() AS home_roll, random() AS region_roll,
                  random() AS channel_roll, random() AS priority_roll, random() AS total_roll,
                  random() AS items_roll, random() AS lag_roll, random() AS note_roll,
                  random() AS note_pick, random() AS assigned_roll, random() AS assignee_roll
           FROM generate_series($1::bigint, $2::bigint) g
         ) s
       ) r
       JOIN customers c ON c.seq = r.customer_seq`,
      [start, end, CUSTOMER_COUNT, NOTES, NOTES.length],
    );
    log(
      `orders ${end.toLocaleString()} / ${ORDER_COUNT.toLocaleString()} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  }
}

// A table seeded before the assignee column existed has it empty in every row, so a share of the rows is assigned once.
async function backfillAssignees(client: Client): Promise<void> {
  const assigned = await client.query(
    "SELECT 1 FROM orders WHERE assignee IS NOT NULL LIMIT 1",
  );
  if (assigned.rows.length > 0) {
    return;
  }
  const started = Date.now();
  const roll = "(hashint8(order_number) & 65535) / 65536.0";
  const pick = "(hashint8(order_number + 7919) & 65535) / 65536.0";
  const updated = await client.query(
    `UPDATE orders SET assignee = ${weightedCase(ORDER_ASSIGNEES, pick)}
     WHERE ${roll} < ${ORDER_ASSIGNED_SHARE}`,
  );
  log(
    `assigned ${(updated.rowCount ?? 0).toLocaleString()} orders in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.QUERY_GRID_DATABASE_URL,
    keepAlive: true,
  });
  await client.connect();
  await client.query("SET statement_timeout = 0");
  await applyFile(client, SCHEMA);
  if (!MIGRATE_ONLY) {
    await seedReference(client);
    await seedCustomers(client);
    await seedOrders(client);
  }
  await backfillAssignees(client);
  await applyFile(client, UPGRADE);
  await applyGenerated(client);
  await client.query("VACUUM (ANALYZE) orders");
  await client.query("ANALYZE customers");
  const count = await client.query<{ count: string }>(
    "SELECT count(*) AS count FROM orders",
  );
  log(`orders in table: ${Number(count.rows[0].count).toLocaleString()}`);
  const size = await client.query<{ size: string }>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
  );
  log(`database size: ${size.rows[0].size}`);
  await client.end();
}

await main();
