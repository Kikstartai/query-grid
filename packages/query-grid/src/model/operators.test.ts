import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type { GridRow } from "./grid-def.ts";
import type {
  QueryState,
  RangeInput,
  RangeState,
  TextState,
} from "./query-state.ts";
import { createTestSource } from "./grid-def.fixture.ts";
import {
  gridDefCapabilities,
  indexId,
  isQueryBudgeted,
  isQueryRunnable,
  planQuery,
} from "./indexes.ts";
import type { IndexedGridDef } from "./grid-def.ts";
import { toLiteralQuery } from "./literal-filters.ts";
import { createMemorySource, memoryCapabilities } from "./memory-source.ts";
import {
  applyAction,
  defaultQuery,
  explainNarrowed,
  listOffers,
} from "./query-actions.ts";
import {
  fromRangeValue,
  resolveRangeValue,
  toRangeValue,
  type RangeValue,
} from "./range-bounds.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import { validateQueryValues } from "./query-validate.ts";
import { applyScope, withScope, type QueryScope } from "./scope.ts";

const DEF: IndexedGridDef = {
  id: "files",
  defaultSort: { field: "created_at", direction: "desc" },
  fields: [
    { key: "id", label: "ID", type: "id" },
    { key: "name", label: "Name", type: "text" },
    { key: "note", label: "Note", type: "text", nullable: true },
    { key: "size", label: "Size", type: "integer" },
    { key: "rate", label: "Rate", type: "decimal", nullable: true },
    { key: "starred", label: "Starred", type: "boolean" },
    { key: "due", label: "Due", type: "date", nullable: true },
    { key: "created_at", label: "Created", type: "datetime" },
    { key: "deleted_at", label: "Deleted", type: "datetime", nullable: true },
    { key: "folder_id", label: "Folder", type: "id", nullable: true },
    { key: "tags", label: "Tags", type: "array", nullable: true },
    { key: "labels", label: "Labels", type: "array", nullable: true },
  ],
  indexes: [
    { equals: [], sort: "created_at", range: true },
    { equals: ["starred"], sort: "created_at" },
    { equals: ["folder_id"], sort: "created_at", range: true },
    { equals: ["folder_id"], sort: "created_at", empty: ["deleted_at"] },
    { equals: [], sort: "size", range: true },
  ],
  textIndexes: ["name"],
  arrayIndexes: ["tags"],
};

const BASE = defaultQuery(DEF);
const FOLDER = "11111111-1111-4111-8111-111111111111";
const CAPABILITIES = gridDefCapabilities(DEF);
const CONTEXT = {
  capabilities: CAPABILITIES,
  allSearchMatchesLoaded: false,
  narrowed: null,
};

function text(field: string, op: TextState["op"], value: string): TextState {
  return { field, op, value };
}

function plan(query: Partial<QueryState>) {
  return planQuery(DEF.indexes, { ...BASE, ...query }, DEF);
}

describe("the URL of the new filters", () => {
  const ranges: RangeState[] = [
    { field: "size", min: "5", max: null, minExclusive: true },
    { field: "size", min: "10", max: "20", exclude: true },
    { field: "due", min: null, max: "2026-03-01", maxExclusive: true },
    {
      field: "rate",
      min: "1.5",
      max: "2.5",
      exclude: true,
      minExclusive: true,
      maxExclusive: true,
    },
  ];
  const query: QueryState = {
    ...BASE,
    ranges,
    texts: [
      text("name", "starts_with", "inv"),
      text("name", "not_contains", "draft"),
      text("note", "ends_with", ".pdf"),
      text("note", "not_equals", "n/a"),
      text("note", "contains", "a..b"),
    ],
    overlaps: { tags: ["red", "blue"] },
  };

  test("ranges carry exclusion and open bounds, several to a field", () => {
    const params = encodeQuery(DEF, query);
    expect(params.getAll("r.size")).toEqual(["(5..", "!10..20"]);
    expect(params.get("r.due")).toBe("..2026-03-01)");
    expect(params.get("r.rate")).toBe("!(1.5..2.5)");
    expect(decodeQuery(DEF, params).ranges).toEqual(ranges);
  });

  test("each text operator has its own key, and overlaps repeat like equality", () => {
    const params = encodeQuery(DEF, query);
    expect(params.get("sw.name")).toBe("inv");
    expect(params.get("nc.name")).toBe("draft");
    expect(params.get("ew.note")).toBe(".pdf");
    expect(params.get("ne.note")).toBe("n/a");
    expect(params.get("c.note")).toBe("a..b");
    expect(params.getAll("o.tags")).toEqual(["red", "blue"]);
    expect(decodeQuery(DEF, params)).toEqual(query);
  });

  test("a mark with no bound beside it is dropped, and a repeat is read once", () => {
    const decoded = decodeQuery(
      DEF,
      new URLSearchParams("r.size=(..9&r.size=(..9&c.name=a&c.name=a"),
    );
    expect(decoded.ranges).toEqual([{ field: "size", min: null, max: "9" }]);
    expect(decoded.texts).toEqual([text("name", "contains", "a")]);
  });

  test("every new key is one the capabilities list", () => {
    const names = listQueryKeys(CAPABILITIES).map((key) => key.name);
    for (const name of encodeQuery(DEF, query).keys()) {
      expect(names).toContain(name);
    }
    expect(names).toContain("o.labels");
    expect(names).not.toContain("f.tags");
  });
});

describe("the values of the new field types", () => {
  const valid = (query: Partial<QueryState>) =>
    validateQueryValues(DEF, { ...BASE, ...query });

  test("a boolean is true or false", () => {
    expect(valid({ equals: { starred: ["true"] } })).toBeNull();
    expect(valid({ equals: { starred: ["yes"] } })?.code).toBe("invalid_value");
  });

  test("a date is a calendar day and a decimal takes a fraction", () => {
    const due = (min: string) =>
      valid({ ranges: [{ field: "due", min, max: null }] });
    expect(due("2026-02-28")).toBeNull();
    expect(due("2026-02-28T00:00:00Z")?.code).toBe("invalid_value");
    expect(due("2026-13-01")?.code).toBe("invalid_value");
    expect(due("2026-02-31")?.code).toBe("invalid_value");
    expect(due("2028-02-29")).toBeNull();
    const rate = (min: string) =>
      valid({ ranges: [{ field: "rate", min, max: null }] });
    expect(rate("-12.375")).toBeNull();
    expect(rate("1e3")?.code).toBe("invalid_value");
    expect(
      valid({ ranges: [{ field: "size", min: "1.5", max: null }] })?.code,
    ).toBe("invalid_value");
  });

  test("an array field takes an overlap and never an equality", () => {
    expect(valid({ overlaps: { tags: ["red"] } })).toBeNull();
    expect(valid({ overlaps: { tags: [] } })?.code).toBe("invalid_value");
    expect(valid({ overlaps: { name: ["red"] } })?.code).toBe("invalid_value");
    expect(valid({ equals: { tags: ["red"] } })?.code).toBe("invalid_value");
    expect(
      valid({
        overlaps: { tags: Array.from({ length: 21 }, (_, at) => `t${at}`) },
      })?.code,
    ).toBe("too_many_values");
  });

  test("a text filter needs a known operator, and the list is capped", () => {
    expect(valid({ texts: [text("name", "starts_with", "a")] })).toBeNull();
    expect(
      valid({ texts: [{ field: "name", op: "like" as never, value: "a" }] })
        ?.code,
    ).toBe("invalid_value");
    expect(
      valid({
        texts: Array.from({ length: 9 }, () => text("name", "contains", "a")),
      }),
    ).toEqual({ code: "too_many_filters", params: { max: 8 } });
  });
});

describe("the plan of the new filters", () => {
  test("an open bound on the sort is still the index's own range", () => {
    const open = plan({
      ranges: [
        {
          field: "created_at",
          min: "2026-01-01",
          max: null,
          minExclusive: true,
        },
      ],
    });
    expect(open).toMatchObject({ narrowed: false, budgeted: false });
    expect(open?.core.ranges).toHaveLength(1);
  });

  test("an excluded range and a second range on one field run narrowed", () => {
    const excluded = plan({
      ranges: [
        { field: "created_at", min: "2026-01-01", max: null, exclude: true },
      ],
    });
    expect(excluded?.narrowed).toBe(true);
    expect(excluded?.core.ranges).toEqual([]);
    const first: RangeState = {
      field: "created_at",
      min: "2026-01-01",
      max: null,
    };
    const second: RangeState = {
      field: "created_at",
      min: null,
      max: "2026-06-01",
    };
    const twice = plan({ ranges: [first, second] });
    expect(twice?.narrowed).toBe(true);
    expect(twice?.core.ranges).toEqual([first]);
  });

  test("a text filter with its own index stays in the core, under the budget", () => {
    const query = { texts: [text("name", "contains", "invoice")] };
    expect(plan(query)).toMatchObject({ narrowed: false, budgeted: true });
    expect(plan(query)?.core.texts).toEqual(query.texts);
    expect(isQueryBudgeted(DEF, { ...BASE, ...query })).toBe(true);
    for (const op of ["starts_with", "ends_with"] as const) {
      expect(plan({ texts: [text("name", op, "inv")] })?.budgeted).toBe(true);
    }
  });

  test("a negation, a short value or a field with no index runs narrowed", () => {
    for (const filter of [
      text("name", "not_contains", "invoice"),
      text("name", "not_equals", "invoice"),
      text("name", "contains", "in"),
      text("note", "contains", "invoice"),
    ]) {
      const narrowed = plan({ texts: [filter] });
      expect(narrowed).toMatchObject({ narrowed: true, budgeted: false });
      expect(narrowed?.core.texts).toEqual([]);
    }
  });

  test("an indexed text filter beside a narrowed part joins the narrowed set", () => {
    const mixed = plan({
      texts: [
        text("name", "contains", "invoice"),
        text("note", "contains", "x"),
      ],
    });
    expect(mixed).toMatchObject({ narrowed: true, budgeted: false });
    const ranged = plan({
      texts: [text("name", "contains", "invoice")],
      ranges: [{ field: "size", min: "1", max: null }],
    });
    expect(ranged).toMatchObject({ narrowed: true, budgeted: false });
  });

  test("an overlap is budgeted with a GIN index and narrowed without one", () => {
    expect(plan({ overlaps: { tags: ["red"] } })).toMatchObject({
      narrowed: false,
      budgeted: true,
    });
    expect(plan({ overlaps: { labels: ["red"] } })).toMatchObject({
      narrowed: true,
      budgeted: false,
    });
    expect(isQueryRunnable(DEF, { ...BASE, overlaps: { name: ["red"] } })).toBe(
      false,
    );
  });

  test("the search takes no text filter or overlap beside it", () => {
    const search = { ...BASE, search: "invoice" };
    const def = { ...DEF, search: ["name"] };
    expect(isQueryRunnable(def, search)).toBe(true);
    expect(
      isQueryRunnable(def, {
        ...search,
        texts: [text("name", "contains", "inv")],
      }),
    ).toBe(false);
    expect(isQueryRunnable(def, { ...search, overlaps: { tags: ["a"] } })).toBe(
      false,
    );
  });

  test("a partial index answers its fields only when they are empty", () => {
    const live = { folder_id: [FOLDER], deleted_at: ["_empty"] };
    expect(plan({ equals: live })).toMatchObject({ narrowed: false });
    expect(
      plan({ equals: { ...live, deleted_at: ["_not_empty"] } }),
    ).toBeNull();
    expect(plan({ equals: { deleted_at: ["_empty"] } })).toBeNull();
    expect(CAPABILITIES.equalsFields).not.toContain("deleted_at");
    expect(CAPABILITIES.groupFields).not.toContain("deleted_at");
    expect(CAPABILITIES.rangeFields).toContain("deleted_at");
    expect(
      isQueryRunnable(
        { ...DEF, search: ["name"] },
        { ...BASE, equals: live, search: "invoice" },
      ),
    ).toBe(true);
    expect(indexId(DEF.indexes[3])).toBe(
      "folder_id|created_at|empty:deleted_at",
    );
    expect(indexId(DEF.indexes[2])).toBe("folder_id|created_at");
  });

  test("a boolean is an equality field and groups like any other", () => {
    expect(CAPABILITIES.equalsFields).toContain("starred");
    expect(CAPABILITIES.groupFields).toContain("starred");
    expect(CAPABILITIES.rangeFields).toEqual([
      "size",
      "rate",
      "due",
      "created_at",
      "deleted_at",
    ]);
    expect(CAPABILITIES.overlapFields).toEqual(["tags", "labels"]);
  });
});

const ROWS: GridRow[] = [
  {
    id: "a",
    name: "Invoice March",
    note: "paid.pdf",
    size: 5,
    rate: 1.5,
    starred: true,
    due: "2026-03-01",
    created_at: "2026-03-01T10:00:00.000000Z",
    deleted_at: null,
    folder_id: FOLDER,
    tags: ["red", "blue"],
    labels: null,
  },
  {
    id: "b",
    name: "invoice April",
    note: null,
    size: 10,
    rate: 2.25,
    starred: false,
    due: "2026-04-15",
    created_at: "2026-04-15T10:00:00.000000Z",
    deleted_at: null,
    folder_id: FOLDER,
    tags: ["green"],
    labels: ["x"],
  },
  {
    id: "c",
    name: "Receipt",
    note: "draft",
    size: 20,
    rate: null,
    starred: false,
    due: null,
    created_at: "2026-05-01T10:00:00.000000Z",
    deleted_at: "2026-05-02T10:00:00.000000Z",
    folder_id: null,
    tags: null,
    labels: [],
  },
];

describe("the memory source runs every operator", () => {
  const source = createMemorySource(DEF, ROWS);
  const signal = new AbortController().signal;
  const ids = async (query: Partial<QueryState>) => {
    const page = await source.fetchPage(
      { ...BASE, sort: { field: "size", direction: "asc" }, ...query },
      50,
      signal,
    );
    return page.rows.map((row) => row.id);
  };
  const size = (range: Partial<RangeState>): RangeState => ({
    field: "size",
    min: null,
    max: null,
    ...range,
  });

  test("open bounds leave the bound itself out", async () => {
    expect(await ids({ ranges: [size({ min: "5" })] })).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      await ids({ ranges: [size({ min: "5", minExclusive: true })] }),
    ).toEqual(["b", "c"]);
    expect(
      await ids({ ranges: [size({ max: "20", maxExclusive: true })] }),
    ).toEqual(["a", "b"]);
  });

  test("an excluded range is everything outside it, an empty cell included", async () => {
    expect(
      await ids({ ranges: [size({ min: "10", max: "10", exclude: true })] }),
    ).toEqual(["a", "c"]);
    expect(
      await ids({
        ranges: [{ field: "rate", min: "1", max: "2", exclude: true }],
      }),
    ).toEqual(["b", "c"]);
    expect(
      await ids({ ranges: [{ field: "rate", min: "1", max: "2" }] }),
    ).toEqual(["a"]);
  });

  test("two ranges on one field both apply", async () => {
    expect(
      await ids({
        ranges: [
          size({ min: "5" }),
          size({ min: "10", max: "10", exclude: true }),
        ],
      }),
    ).toEqual(["a", "c"]);
  });

  test("a date field compares calendar days, and one day is a range of itself", async () => {
    const due = (range: Partial<RangeState>): RangeState => ({
      field: "due",
      min: null,
      max: null,
      ...range,
    });
    expect(
      await ids({ ranges: [due({ min: "2026-03-01", max: "2026-03-01" })] }),
    ).toEqual(["a"]);
    expect(
      await ids({
        ranges: [due({ min: "2026-03-01", max: "2026-03-01", exclude: true })],
      }),
    ).toEqual(["b", "c"]);
    expect(
      await ids({ ranges: [due({ min: "2026-03-01", minExclusive: true })] }),
    ).toEqual(["b"]);
  });

  test("the text operators ignore case, and a negation keeps an empty cell", async () => {
    const run = (field: string, op: TextState["op"], value: string) =>
      ids({ texts: [text(field, op, value)] });
    expect(await run("name", "starts_with", "INV")).toEqual(["a", "b"]);
    expect(await run("name", "ends_with", "april")).toEqual(["b"]);
    expect(await run("note", "contains", "PDF")).toEqual(["a"]);
    expect(await run("note", "not_contains", "pdf")).toEqual(["b", "c"]);
    expect(await run("note", "not_equals", "draft")).toEqual(["a", "b"]);
    expect(await run("name", "not_equals", "receipt")).toEqual(["a", "b", "c"]);
  });

  test("two text filters on one field both apply", async () => {
    expect(
      await ids({
        texts: [
          text("name", "contains", "invoice"),
          text("name", "not_contains", "april"),
        ],
      }),
    ).toEqual(["a"]);
  });

  test("an overlap matches any shared value, a boolean its own", async () => {
    expect(await ids({ overlaps: { tags: ["blue", "green"] } })).toEqual([
      "a",
      "b",
    ]);
    expect(await ids({ overlaps: { labels: ["x"] } })).toEqual(["b"]);
    expect(await ids({ equals: { starred: ["true"] } })).toEqual(["a"]);
    expect(await ids({ equals: { starred: ["false"] } })).toEqual(["b", "c"]);
  });

  test("match any ORs the new filters too", async () => {
    expect(
      await ids({
        combine: "or",
        texts: [text("name", "starts_with", "rec")],
        overlaps: { tags: ["red"] },
      }),
    ).toEqual(["a", "c"]);
  });

  test("a client grid offers all of it", () => {
    const capabilities = memoryCapabilities(DEF);
    expect(capabilities.textFields).toEqual(["name", "note"]);
    expect(capabilities.overlapFields).toEqual(["tags", "labels"]);
    expect(capabilities.equalsFields).toEqual([
      "id",
      "name",
      "note",
      "starred",
      "folder_id",
    ]);
    const offers = listOffers(DEF, BASE, {
      capabilities,
      allSearchMatchesLoaded: false,
      narrowed: null,
    });
    expect(offers.texts).toEqual(["name", "note"]);
    expect(offers.overlaps).toEqual(["tags", "labels"]);
  });
});

describe("the actions of the new filters", () => {
  const memory = {
    capabilities: memoryCapabilities(DEF),
    allSearchMatchesLoaded: false,
    narrowed: null,
  };
  const run = (query: QueryState, action: Parameters<typeof applyAction>[2]) =>
    applyAction(DEF, query, action, memory);

  test("a text filter is added at the end, replaced in place and removed by position", () => {
    const one = run(BASE, {
      type: "setText",
      field: "name",
      op: "contains",
      value: "a",
    });
    const two = run(one, {
      type: "setText",
      field: "name",
      op: "not_contains",
      value: "b",
    });
    expect(two.texts).toEqual([
      text("name", "contains", "a"),
      text("name", "not_contains", "b"),
    ]);
    const replaced = run(two, {
      type: "setText",
      field: "note",
      op: "ends_with",
      value: "c",
      at: 0,
    });
    expect(replaced.texts[0]).toEqual(text("note", "ends_with", "c"));
    expect(run(replaced, { type: "removeText", at: 0 }).texts).toEqual([
      text("name", "not_contains", "b"),
    ]);
    expect(run(replaced, { type: "clearTexts" }).texts).toEqual([]);
  });

  test("setRange replaces a field's ranges, addRange adds one and clearRange takes one out", () => {
    const set = run(BASE, {
      type: "setRange",
      field: "size",
      min: "1",
      max: null,
    });
    const added = run(set, {
      type: "addRange",
      field: "size",
      min: "5",
      max: "5",
      exclude: true,
    });
    expect(added.ranges).toEqual([
      { field: "size", min: "1", max: null },
      { field: "size", min: "5", max: "5", exclude: true },
    ]);
    expect(
      run(added, { type: "clearRange", field: "size", at: 0 }).ranges,
    ).toEqual([{ field: "size", min: "5", max: "5", exclude: true }]);
    expect(run(added, { type: "clearRange", field: "size" }).ranges).toEqual(
      [],
    );
    expect(
      run(added, {
        type: "setRange",
        field: "size",
        min: null,
        max: "3",
        maxExclusive: true,
      }).ranges,
    ).toEqual([{ field: "size", min: null, max: "3", maxExclusive: true }]);
  });

  test("an overlap is set, trimmed by value and cleared", () => {
    const set = run(BASE, {
      type: "setOverlap",
      field: "tags",
      values: ["a", "b", "a"],
    });
    expect(set.overlaps).toEqual({ tags: ["a", "b"] });
    const less = run(set, {
      type: "removeOverlapValue",
      field: "tags",
      value: "a",
    });
    expect(less.overlaps).toEqual({ tags: ["b"] });
    expect(
      run(less, { type: "removeOverlapValue", field: "tags", value: "b" })
        .overlaps,
    ).toEqual({});
    expect(run(set, { type: "clearOverlap", field: "tags" }).overlaps).toEqual(
      {},
    );
  });

  test("each range, text filter and overlap has a chip that clears just itself", () => {
    const query: QueryState = {
      ...BASE,
      ranges: [
        { field: "size", min: "1", max: null, minExclusive: true },
        { field: "size", min: "5", max: "5", exclude: true },
      ],
      texts: [text("name", "starts_with", "inv")],
      overlaps: { tags: ["red"] },
    };
    const chips = listFilterChips(DEF, query);
    expect(chips.map((chip) => chip.id)).toEqual([
      "overlap:tags",
      "range:size",
      "range:size:1",
      "text:0",
      "sort",
    ]);
    expect(chips[1]).toMatchObject({ op: "gt", min: "1", max: null });
    expect(chips[2]).toMatchObject({
      op: "neq",
      min: "5",
      max: null,
      clear: { type: "clearRange", field: "size", at: 1 },
    });
    expect(chips[3]).toMatchObject({
      kind: "text",
      op: "starts_with",
      clear: { type: "removeText", at: 0 },
    });
    expect(chips[0]).toMatchObject({
      kind: "overlap",
      clear: { type: "clearOverlap", field: "tags" },
    });
  });

  test("a server grid offers a text filter on an indexed field without a narrowed size", () => {
    const offers = listOffers(DEF, BASE, CONTEXT);
    expect(offers.overlaps).toEqual(["tags"]);
    expect(offers.texts).toEqual(["name"]);
    expect(offers.narrowTexts).toEqual([]);
    expect(
      explainNarrowed(BASE, { kind: "text", field: "name" }, CONTEXT).code,
    ).toBe("narrow_counting");
    const basis = CAPABILITIES.narrowBasis({
      ...BASE,
      texts: [text("note", "contains", "x")],
    });
    const sized = (rows: number, over: boolean) => ({
      ...CONTEXT,
      narrowed: {
        limit: 100,
        and: { rows, over, capped: over },
        or: null,
        andBasis: basis,
        orBasis: "",
      },
    });
    const over = sized(100, true);
    expect(listOffers(DEF, BASE, over).texts).toEqual(["name"]);
    expect(listOffers(DEF, BASE, over).narrowTexts).toEqual([]);
    expect(
      explainNarrowed(BASE, { kind: "text", field: "name" }, over),
    ).toMatchObject({
      code: "narrow_first",
      rows: 100,
      capped: true,
    });
    expect(listOffers(DEF, BASE, over).ranges).toContain("created_at");
    expect(listOffers(DEF, BASE, over).narrowRanges).toEqual([]);
    expect(
      explainNarrowed(BASE, { kind: "range", field: "created_at" }, over),
    ).toMatchObject({ code: "narrow_first", field: "created_at", rows: 100 });
    const under = sized(40, false);
    expect(listOffers(DEF, BASE, under).narrowRanges).toEqual(
      CAPABILITIES.rangeFields,
    );
    expect(listOffers(DEF, BASE, under).texts).toEqual(["name", "note"]);
    expect(listOffers(DEF, BASE, under).narrowTexts).toEqual(["name", "note"]);
    const indexed = applyAction(
      DEF,
      BASE,
      { type: "setText", field: "name", op: "contains", value: "invoice" },
      CONTEXT,
    );
    expect(indexed.texts).toHaveLength(1);
  });
});

describe("a date preset on a date field", () => {
  test("resolves to the viewer's calendar days", () => {
    const now = new Date(2026, 2, 15, 9, 30);
    const literal = toLiteralQuery(
      DEF,
      {
        ...BASE,
        ranges: [{ field: "due", min: null, max: null, preset: "this-month" }],
      },
      now,
    );
    expect(literal.ranges).toEqual([
      { field: "due", min: "2026-03-01", max: "2026-03-31" },
    ]);
    expect(validateQueryValues(DEF, literal)).toBeNull();
  });
});

describe("a scope", () => {
  const scope: QueryScope = {
    equals: { folder_id: [FOLDER], deleted_at: ["_empty"] },
  };

  test("is ANDed into every request and never into the user's query", async () => {
    const seen: QueryState[] = [];
    const record = async (query: QueryState) => {
      seen.push(query);
    };
    const source = withScope(
      createTestSource(CAPABILITIES, {
        fetchPage: async (query) => {
          await record(query);
          return { rows: [], nextCursor: null, hasNext: false };
        },
        fetchCount: async (query) => {
          await record(query);
          return { count: 0, capped: false, source: "exact" };
        },
        fetchTotals: async (query) => {
          await record(query);
          return [];
        },
        fetchGroups: async (query) => {
          await record(query);
          return { groups: [], source: "live", truncated: false };
        },
        fetchNarrowed: async (query) => {
          await record(query);
          return null;
        },
      }),
      scope,
    );
    const signal = new AbortController().signal;
    const user: QueryState = { ...BASE, equals: { starred: ["true"] } };
    await source.fetchPage(user, 10, signal);
    await source.fetchCount(user, false, signal);
    await source.fetchTotals(user, signal);
    await source.fetchGroups(user, signal);
    await source.fetchNarrowed(user, signal);
    expect(seen).toHaveLength(5);
    for (const query of seen) {
      expect(query.equals).toEqual({ starred: ["true"], ...scope.equals });
    }
    expect(user.equals).toEqual({ starred: ["true"] });
    expect(listFilterChips(DEF, user).map((chip) => chip.id)).toEqual([
      "eq:starred",
      "sort",
    ]);
  });

  test("takes its fields and Match any out of what is offered", () => {
    const { capabilities } = withScope(createTestSource(CAPABILITIES), scope);
    expect(capabilities.equalsFields).toEqual(["starred"]);
    expect(capabilities.groupFields).toEqual(["starred"]);
    expect(capabilities.combineOr).toBe(false);
    expect(capabilities.canRun(BASE)).toBe(true);
    expect(
      capabilities.canRun({ ...BASE, equals: { folder_id: [FOLDER] } }),
    ).toBe(false);
    expect(capabilities.canRun({ ...BASE, combine: "or" })).toBe(false);
    expect(listQueryKeys(capabilities).map((key) => key.name)).not.toContain(
      "f.folder_id",
    );
  });

  test("decides what can run: the scoped query must have an index", () => {
    const { capabilities } = withScope(createTestSource(CAPABILITIES), scope);
    expect(
      capabilities.canRun({ ...BASE, equals: { starred: ["true"] } }),
    ).toBe(false);
    expect(
      capabilities.isNarrowed({
        ...BASE,
        ranges: [{ field: "size", min: "1", max: null }],
      }),
    ).toBe(true);
    expect(
      CAPABILITIES.canRun({ ...BASE, equals: { starred: ["true"] } }),
    ).toBe(true);
  });

  test("keeps a server grid from showing whole-table facet counts", async () => {
    const whole = createTestSource(CAPABILITIES, {
      fetchFacets: async () => [{ value: "x", count: 9 }],
    });
    const scoped = withScope(whole, scope);
    const signal = new AbortController().signal;
    expect(await scoped.fetchFacets(BASE, signal)).toEqual([]);
    expect(scoped.capabilities.isFacetCountExact(BASE)).toBe(false);
  });

  test("filters a client grid's rows, ranges and text included", async () => {
    const source = withScope(createMemorySource(DEF, ROWS), {
      equals: { deleted_at: ["_empty"] },
      ranges: [{ field: "size", min: "5", max: null, minExclusive: true }],
      texts: [text("name", "starts_with", "inv")],
    });
    const signal = new AbortController().signal;
    const page = await source.fetchPage(BASE, 10, signal);
    expect(page.rows.map((row) => row.id)).toEqual(["b"]);
    expect((await source.fetchCount(BASE, false, signal)).count).toBe(1);
  });

  test("an empty scope is no wrapper at all", () => {
    const source = createTestSource(CAPABILITIES);
    expect(withScope(source, {})).toBe(source);
    expect(applyScope(BASE, { equals: { a: ["b"] } }).equals).toEqual({
      a: ["b"],
    });
  });
});

describe("a range as an operator and its values", () => {
  const created = DEF.fields[7];
  const due = DEF.fields[6];
  const size = DEF.fields[3];

  test("each operator on a datetime is whole days, and reads back as the same day", () => {
    const cases: [RangeValue, RangeInput][] = [
      [
        { op: "eq", first: "2026-03-03", second: null },
        {
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-03T23:59:59.999999Z",
        },
      ],
      [
        { op: "neq", first: "2026-03-03", second: null },
        {
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-03T23:59:59.999999Z",
          exclude: true,
        },
      ],
      [
        { op: "gt", first: "2026-03-03", second: null },
        { min: "2026-03-03T23:59:59.999999Z", max: null, minExclusive: true },
      ],
      [
        { op: "gte", first: "2026-03-03", second: null },
        { min: "2026-03-03T00:00:00.000000Z", max: null },
      ],
      [
        { op: "lt", first: "2026-03-03", second: null },
        { min: null, max: "2026-03-03T00:00:00.000000Z", maxExclusive: true },
      ],
      [
        { op: "lte", first: "2026-03-03", second: null },
        { min: null, max: "2026-03-03T23:59:59.999999Z" },
      ],
      [
        { op: "between", first: "2026-03-03", second: "2026-03-09" },
        {
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-09T23:59:59.999999Z",
        },
      ],
      [
        { op: "not_between", first: "2026-03-03", second: "2026-03-09" },
        {
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-09T23:59:59.999999Z",
          exclude: true,
        },
      ],
    ];
    for (const [value, range] of cases) {
      expect(fromRangeValue(created, value)).toEqual(range);
      expect(toRangeValue(created, range)).toEqual(value);
    }
  });

  test("a date field keeps the day and a number its text", () => {
    expect(
      fromRangeValue(due, { op: "eq", first: "2026-03-03", second: null }),
    ).toEqual({
      min: "2026-03-03",
      max: "2026-03-03",
    });
    expect(
      fromRangeValue(size, { op: "gt", first: "5", second: null }),
    ).toEqual({
      min: "5",
      max: null,
      minExclusive: true,
    });
    expect(toRangeValue(size, { min: "5", max: "5", exclude: true })).toEqual({
      op: "neq",
      first: "5",
      second: null,
    });
    expect(toRangeValue(size, { min: "5", max: null })).toEqual({
      op: "gte",
      first: "5",
      second: null,
    });
  });

  test("nothing to compare with is no range, and a preset has no operator", () => {
    expect(
      fromRangeValue(size, { op: "gt", first: null, second: null }),
    ).toBeNull();
    expect(
      fromRangeValue(size, { op: "between", first: null, second: null }),
    ).toBeNull();
    expect(
      fromRangeValue(size, { op: "between", first: null, second: "9" }),
    ).toEqual({
      min: null,
      max: "9",
    });
    expect(toRangeValue(size, null)).toBeNull();
    expect(
      toRangeValue(due, { min: null, max: null, preset: "today" }),
    ).toBeNull();
  });
});

describe("a control that keeps its operator", () => {
  const size = DEF.fields[3];

  test("a half-open or one-value range still reads as between when that is picked", () => {
    expect(resolveRangeValue(size, { min: "5", max: null }, "between")).toEqual(
      {
        op: "between",
        first: "5",
        second: null,
      },
    );
    expect(resolveRangeValue(size, { min: null, max: "9" }, "between")).toEqual(
      {
        op: "between",
        first: null,
        second: "9",
      },
    );
    expect(resolveRangeValue(size, { min: "5", max: "5" }, "between")).toEqual({
      op: "between",
      first: "5",
      second: "5",
    });
    expect(
      resolveRangeValue(
        size,
        { min: "5", max: "5", exclude: true },
        "not_between",
      ),
    ).toEqual({ op: "not_between", first: "5", second: "5" });
  });

  test("an operator that cannot say the range gives way to the one that can", () => {
    expect(
      resolveRangeValue(
        size,
        { min: "5", max: null, minExclusive: true },
        "between",
      )?.op,
    ).toBe("gt");
    expect(resolveRangeValue(size, { min: "5", max: null }, "eq")?.op).toBe(
      "gte",
    );
    expect(resolveRangeValue(size, { min: "5", max: null }, null)?.op).toBe(
      "gte",
    );
  });

  test("setRange with a position replaces that one range of the field", () => {
    const context = {
      capabilities: memoryCapabilities(DEF),
      allSearchMatchesLoaded: false,
      narrowed: null,
    };
    const query: QueryState = {
      ...BASE,
      ranges: [
        { field: "size", min: "1", max: null },
        { field: "rate", min: "1", max: null },
        { field: "size", min: "5", max: "5", exclude: true },
      ],
    };
    const first = applyAction(
      DEF,
      query,
      { type: "setRange", field: "size", at: 0, min: null, max: "3" },
      context,
    );
    expect(first.ranges).toEqual([
      { field: "size", min: null, max: "3" },
      query.ranges[1],
      query.ranges[2],
    ]);
    const added = applyAction(
      DEF,
      BASE,
      { type: "setRange", field: "size", at: 0, min: "2", max: null },
      context,
    );
    expect(added.ranges).toEqual([{ field: "size", min: "2", max: null }]);
  });
});
