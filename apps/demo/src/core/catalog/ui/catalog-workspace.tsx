"use client";

import { useState } from "react";

import type { FieldDef, GridRow, SortState } from "@kikstart/query-grid";
import {
  CountDisplay,
  DataGrid,
  FacetPanel,
  FilterChips,
  SortControl,
} from "@kikstart/query-grid-react/components";

import { SiteBrand } from "@/lib/site-brand";

const KINDS = [
  { value: "fruit", label: "Fruit" },
  { value: "vegetable", label: "Vegetable" },
  { value: "grain", label: "Grain" },
];

const FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text", operators: [], width: 220 },
  {
    key: "kind",
    label: "Kind",
    type: "enum",
    operators: [],
    options: KINDS,
    width: 140,
  },
  { key: "price", label: "Price", type: "money", operators: [], width: 120 },
  { key: "stock", label: "Stock", type: "integer", operators: [], width: 100 },
  { key: "id", label: "ID", type: "text", operators: [], hidden: true },
];

const NAMES = [
  "Apple",
  "Barley",
  "Carrot",
  "Date",
  "Endive",
  "Fig",
  "Garlic",
  "Hops",
  "Iceberg",
  "Jujube",
  "Kale",
  "Lime",
];

const ROWS: GridRow[] = Array.from({ length: 60 }, (_, index) => ({
  id: `item-${index + 1}`,
  name: `${NAMES[index % NAMES.length]} ${Math.floor(index / NAMES.length) + 1}`,
  kind: KINDS[index % KINDS.length].value,
  price: 250 + ((index * 137) % 900),
  stock: (index * 29) % 180,
}));

function compare(a: GridRow, b: GridRow, sort: SortState): number {
  const left = a[sort.field] ?? "";
  const right = b[sort.field] ?? "";
  const order = left < right ? -1 : Number(left > right);
  return sort.direction === "asc" ? order : -order;
}

export function CatalogWorkspace() {
  const [kinds, setKinds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>({
    field: "name",
    direction: "asc",
  });
  const rows = ROWS.filter(
    (row) => kinds.length === 0 || kinds.includes(String(row.kind)),
  ).sort((a, b) => compare(a, b, sort));
  const countOf = (kind: string) =>
    ROWS.filter((row) => row.kind === kind).length;
  return (
    <div className="workspace" data-source="props">
      <header className="workspace-head">
        <SiteBrand />
        <h1>Base components</h1>
        <CountDisplay
          status="idle"
          value={{ count: rows.length, capped: false, source: "exact" }}
        />
      </header>
      <p className="workspace-note">
        The same components with no provider, no query state and no server:
        sixty rows in a constant, filtered and sorted by this page&apos;s own{" "}
        <code>useState</code>, passed in as plain props.
      </p>
      <div className="workspace-chips">
        <SortControl
          options={FIELDS.filter((field) => !field.hidden).map((field) => ({
            value: field.key,
            label: field.label,
          }))}
          value={sort.field}
          direction={sort.direction}
          onSortChange={(field, direction) => setSort({ field, direction })}
        />
        <FilterChips
          chips={[
            {
              id: "kind",
              kind: "equals",
              label: "Kind:",
              values: kinds.map((kind) => ({
                id: kind,
                label: KINDS.find((item) => item.value === kind)?.label ?? kind,
              })),
              removable: true,
            },
          ].filter((chip) => chip.values.length > 0)}
          onRemove={(_chip, value) =>
            setKinds(kinds.filter((kind) => kind !== value))
          }
          onReset={() => setKinds([])}
        />
      </div>
      <div className="workspace-main">
        <FacetPanel
          label="Kind"
          options={KINDS.map((kind) => ({
            ...kind,
            count: countOf(kind.value),
          }))}
          values={kinds}
          onValuesChange={setKinds}
          multiple
          total={ROWS.length}
        />
        <DataGrid
          fields={FIELDS}
          rows={rows}
          hasNext={false}
          onEndReached={() => undefined}
          loading={false}
          sort={sort}
          sortableFields={["name", "kind", "price", "stock"]}
          onSortChange={(field, direction) => setSort({ field, direction })}
          resetKey={`${kinds.join(",")}|${sort.field}|${sort.direction}`}
        />
      </div>
    </div>
  );
}
