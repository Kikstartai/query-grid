import { describe, expect, test } from "bun:test";

import type { IndexedGridDef } from "./grid-def.ts";
import type { Problem } from "./problems.ts";
import { SORT_MAX } from "./query-state.ts";
import { normalizeStoredGridDef } from "./stored-def.ts";

const FULL_DEF: IndexedGridDef = {
  id: "orders-2026",
  fields: [
    { key: "id", label: "Id", type: "id", hidden: true },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
      render: "badge",
      tones: { open: "info", closed: "success" },
      width: 140,
      pinned: true,
    },
    {
      key: "customer_id",
      label: "Customer",
      type: "text",
      lookup: { labelField: "customer_name" },
    },
    { key: "customer_name", label: "Customer name", type: "text", wrap: true },
    { key: "total", label: "Total", type: "money", currency: "EUR" },
    { key: "quantity", label: "Quantity", type: "integer" },
    { key: "position", label: "Position", type: "decimal" },
    { key: "note", label: "Note", type: "text", nullable: true },
    {
      key: "tags",
      label: "Tags",
      type: "array",
      maxValues: 5,
      render: "list",
      options: [{ value: "rush", label: "Rush" }],
    },
    { key: "created_at", label: "Created", type: "datetime" },
  ],
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
  totals: ["total", "quantity"],
  search: ["customer_name", "note"],
  orderField: "position",
  indexes: [
    { equals: [], sort: "created_at", range: true },
    {
      equals: ["status"],
      sort: "created_at",
      multi: true,
      empty: ["note"],
      then: ["total", "quantity"],
    },
  ],
  textIndexes: ["customer_name"],
  arrayIndexes: ["tags"],
};

function stored(change: (def: Record<string, unknown>) => void = () => {}) {
  const def = JSON.parse(JSON.stringify(FULL_DEF)) as Record<string, unknown>;
  change(def);
  return def;
}

function storedWith(change: Record<string, unknown>) {
  return { ...stored(), ...change };
}

function storedField(index: number, change: Record<string, unknown>) {
  return stored((def) => {
    const fields = def.fields as Record<string, unknown>[];
    fields[index] = { ...fields[index], ...change };
  });
}

function listProblems(input: unknown): Problem[] {
  const result = normalizeStoredGridDef(input);
  return result.ok ? [] : result.problems;
}

function invalidAt(path: string): Problem {
  return { code: "stored_invalid", params: { path } };
}

function unknownKeyAt(path: string): Problem {
  return { code: "stored_unknown_key", params: { path } };
}

describe("normalizeStoredGridDef", () => {
  test("a full def read back from JSON comes back equal", () => {
    expect(normalizeStoredGridDef(stored())).toEqual({
      ok: true,
      def: FULL_DEF,
    });
  });

  test("the result is a fresh copy the input cannot change afterwards", () => {
    const input = stored();
    const result = normalizeStoredGridDef(input);
    const fields = input.fields as Record<string, unknown>[];
    const indexes = input.indexes as Record<string, unknown>[];
    fields[1].label = "Changed";
    (fields[1].options as unknown[]).pop();
    (fields[1].tones as Record<string, string>).open = "danger";
    (indexes[1].equals as string[]).push("note");
    (input.totals as string[]).pop();
    fields.pop();
    input.id = "changed";
    expect(result).toEqual({ ok: true, def: FULL_DEF });
    expect(result.ok && result.def.fields).not.toBe(fields);
  });

  test("an input that is not a plain object is refused at the root", () => {
    for (const input of [null, [], "x", 42, undefined, true, new Date(0)]) {
      expect(normalizeStoredGridDef(input)).toEqual({
        ok: false,
        problems: [invalidAt("")],
      });
    }
  });

  test("an input that throws while it is read is refused and never throws", () => {
    const input = stored();
    Object.defineProperty(input, "id", {
      enumerable: true,
      get() {
        throw new Error("trap");
      },
    });
    expect(listProblems(input)).toEqual([invalidAt("")]);
  });

  test("an absent optional key stays absent and indexes default to none", () => {
    const result = normalizeStoredGridDef({
      id: "small",
      fields: [{ key: "id", label: "Id", type: "id" }],
      defaultSort: { field: "id", direction: "asc" },
    });
    expect(result).toEqual({
      ok: true,
      def: {
        id: "small",
        fields: [{ key: "id", label: "Id", type: "id" }],
        defaultSort: { field: "id", direction: "asc" },
        indexes: [],
      },
    });
    expect(result.ok && Object.keys(result.def)).toEqual([
      "id",
      "fields",
      "defaultSort",
      "indexes",
    ]);
    expect(result.ok && Object.keys(result.def.fields[0])).toEqual([
      "key",
      "label",
      "type",
    ]);
  });

  test("an unknown key is refused at the root, a field, an option and an index", () => {
    const input = stored((def) => {
      def.extra = 1;
      const fields = def.fields as Record<string, unknown>[];
      fields[0].cell = "x";
      (fields[1].options as Record<string, unknown>[])[0].color = "red";
      (def.indexes as Record<string, unknown>[])[0].where = "x";
      (def.facet as Record<string, unknown>).other = true;
      (def.defaultSort as Record<string, unknown>).nulls = "last";
      (fields[2].lookup as Record<string, unknown>).table = "customers";
    });
    expect(listProblems(input)).toEqual([
      unknownKeyAt("extra"),
      unknownKeyAt("fields.0.cell"),
      unknownKeyAt("fields.1.options.0.color"),
      unknownKeyAt("fields.2.lookup.table"),
      unknownKeyAt("defaultSort.nulls"),
      unknownKeyAt("facet.other"),
      unknownKeyAt("indexes.0.where"),
    ]);
  });

  test("storage names are the host's: table and counterTable are refused", () => {
    const input = stored((def) => {
      def.table = "orders";
      (def.facet as Record<string, unknown>).counterTable = "order_counts";
    });
    expect(listProblems(input)).toEqual([
      unknownKeyAt("table"),
      unknownKeyAt("facet.counterTable"),
    ]);
  });

  test("a __proto__ or constructor key is refused and never copied", () => {
    const input = stored() as Record<string, unknown>;
    const polluted = JSON.parse(
      '{"__proto__": {"polluted": true}, "constructor": {"prototype": {}}}',
    ) as Record<string, unknown>;
    const fields = input.fields as Record<string, unknown>[];
    fields[0] = { ...fields[0], ...polluted };
    const root = { ...input, ...polluted };
    expect(Object.hasOwn(root, "__proto__")).toBe(true);
    expect(listProblems(root)).toEqual([
      unknownKeyAt("__proto__"),
      unknownKeyAt("constructor"),
      unknownKeyAt("fields.0.__proto__"),
      unknownKeyAt("fields.0.constructor"),
    ]);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });

  test("a field key that names a prototype member is refused", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      expect(listProblems(storedField(2, { key }))).toEqual([
        invalidAt("fields.2.key"),
      ]);
    }
  });

  test("a field that is not an object is invalid", () => {
    const input = stored((def) => {
      (def.fields as unknown[]).push("x", null, []);
    });
    expect(listProblems(input)).toEqual([
      invalidAt("fields.10"),
      invalidAt("fields.11"),
      invalidAt("fields.12"),
    ]);
  });

  test("a tone keyed by a prototype member is refused", () => {
    const tones = JSON.parse(
      '{"open": "info", "__proto__": "danger", "constructor": "danger"}',
    ) as unknown;
    expect(listProblems(storedField(1, { tones }))).toEqual([
      invalidAt("fields.1.tones.__proto__"),
      invalidAt("fields.1.tones.constructor"),
    ]);
  });

  test("a value of the wrong type, empty, out of range or off its pattern is invalid", () => {
    const cases: [Record<string, unknown>, string][] = [
      [storedWith({ id: "" }), "id"],
      [storedWith({ id: "has space" }), "id"],
      [storedWith({ id: "x".repeat(101) }), "id"],
      [storedWith({ id: 7 }), "id"],
      [storedWith({ fields: {} }), "fields"],
      [storedWith({ fields: [] }), "fields"],
      [storedWith({ defaultSort: undefined }), "defaultSort"],
      [storedWith({ defaultSort: "id" }), "defaultSort"],
      [storedWith({ indexes: {} }), "indexes"],
      [storedWith({ search: "note" }), "search"],
      [storedWith({ totals: [7] }), "totals.0"],
      [storedWith({ facet: null }), "facet"],
      [storedWith({ orderField: 7 }), "orderField"],
      [storedField(2, { key: "Customer" }), "fields.2.key"],
      [storedField(2, { key: "c".repeat(64) }), "fields.2.key"],
      [storedField(2, { key: undefined }), "fields.2.key"],
      [storedField(7, { label: "" }), "fields.7.label"],
      [storedField(7, { label: "x".repeat(201) }), "fields.7.label"],
      [storedField(7, { type: "json" }), "fields.7.type"],
      [storedField(7, { nullable: "yes" }), "fields.7.nullable"],
      [storedField(7, { pinned: 1 }), "fields.7.pinned"],
      [storedField(7, { hidden: null }), "fields.7.hidden"],
      [storedField(7, { wrap: "no" }), "fields.7.wrap"],
      [storedField(7, { maxValues: 0 }), "fields.7.maxValues"],
      [storedField(7, { maxValues: 1.5 }), "fields.7.maxValues"],
      [storedField(7, { maxValues: 101 }), "fields.7.maxValues"],
      [storedField(7, { width: 19 }), "fields.7.width"],
      [storedField(7, { width: 2001 }), "fields.7.width"],
      [storedField(7, { width: "120" }), "fields.7.width"],
      [storedField(7, { render: "chip" }), "fields.7.render"],
      [storedField(7, { tones: [] }), "fields.7.tones"],
      [storedField(7, { tones: { a: "loud" } }), "fields.7.tones.a"],
      [storedField(7, { options: "open" }), "fields.7.options"],
      [storedField(7, { options: ["open"] }), "fields.7.options.0"],
      [
        storedField(7, { options: [{ value: "", label: "Open" }] }),
        "fields.7.options.0.value",
      ],
      [
        storedField(7, { options: [{ value: "open" }] }),
        "fields.7.options.0.label",
      ],
      [storedField(7, { lookup: "customer_name" }), "fields.7.lookup"],
      [storedField(7, { lookup: {} }), "fields.7.lookup.labelField"],
      [storedField(4, { currency: "EURO" }), "fields.4.currency"],
      [storedField(4, { currency: 978 }), "fields.4.currency"],
    ];
    for (const [input, path] of cases) {
      expect(listProblems(input)).toEqual([invalidAt(path)]);
    }
  });

  test("a width that is not finite is invalid", () => {
    for (const width of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(listProblems(storedField(7, { width }))).toEqual([
        invalidAt("fields.7.width"),
      ]);
    }
  });

  test("a sort needs a declared field and a known direction", () => {
    expect(
      listProblems(
        storedWith({ defaultSort: { field: "note", direction: "up" } }),
      ),
    ).toEqual([invalidAt("defaultSort.direction")]);
    expect(
      listProblems(
        storedWith({ defaultSort: { field: "gone", direction: "asc" } }),
      ),
    ).toEqual([
      {
        code: "stored_unknown_field",
        params: { path: "defaultSort.field", field: "gone" },
      },
    ]);
  });

  test("a currency on a field that is not money is invalid", () => {
    expect(listProblems(storedField(5, { currency: "EUR" }))).toEqual([
      invalidAt("fields.5.currency"),
    ]);
  });

  test("an enum without options is invalid", () => {
    expect(
      listProblems(
        stored((def) => {
          delete def.facet;
          (def.fields as Record<string, unknown>[])[1] = {
            key: "status",
            label: "Status",
            type: "enum",
          };
        }),
      ),
    ).toEqual([invalidAt("fields.1.options")]);
  });

  test("a def with no id field is refused", () => {
    expect(
      listProblems({
        id: "small",
        fields: [{ key: "name", label: "Name", type: "text" }],
        defaultSort: { field: "name", direction: "asc" },
      }),
    ).toEqual([
      { code: "stored_unknown_field", params: { path: "fields", field: "id" } },
    ]);
  });

  test("a reference to a field the def does not declare is refused", () => {
    const input = stored((def) => {
      const fields = def.fields as Record<string, unknown>[];
      fields[2].lookup = { labelField: "gone_a" };
      def.facet = { field: "gone_b" };
      def.totals = ["total", "gone_c"];
      def.search = ["gone_d"];
      def.orderField = "gone_e";
      def.indexes = [
        {
          equals: ["gone_f"],
          sort: "gone_g",
          empty: ["gone_h"],
          then: ["gone_i"],
        },
      ];
      def.textIndexes = ["gone_j"];
      def.arrayIndexes = ["gone_k"];
    });
    expect(
      listProblems(input).map((problem) => [
        problem.code,
        problem.params.path,
        problem.params.field,
      ]),
    ).toEqual([
      ["stored_unknown_field", "fields.2.lookup.labelField", "gone_a"],
      ["stored_unknown_field", "facet.field", "gone_b"],
      ["stored_unknown_field", "totals.1", "gone_c"],
      ["stored_unknown_field", "search.0", "gone_d"],
      ["stored_unknown_field", "orderField", "gone_e"],
      ["stored_unknown_field", "textIndexes.0", "gone_j"],
      ["stored_unknown_field", "arrayIndexes.0", "gone_k"],
      ["stored_unknown_field", "indexes.0.equals.0", "gone_f"],
      ["stored_unknown_field", "indexes.0.sort", "gone_g"],
      ["stored_unknown_field", "indexes.0.empty.0", "gone_h"],
      ["stored_unknown_field", "indexes.0.then.0", "gone_i"],
    ]);
  });

  test("a def whose fields cannot be read reports no reference to them", () => {
    expect(listProblems(storedWith({ fields: "x", orderField: 7 }))).toEqual([
      invalidAt("fields"),
      invalidAt("orderField"),
    ]);
  });

  test("a facet, a total and an order field must suit the field they name", () => {
    expect(listProblems(storedWith({ facet: { field: "note" } }))).toEqual([
      invalidAt("facet.field"),
    ]);
    expect(listProblems(storedWith({ totals: ["total", "position"] }))).toEqual(
      [invalidAt("totals.1")],
    );
    expect(listProblems(storedField(5, { nullable: true }))).toEqual([
      invalidAt("totals.1"),
    ]);
    expect(listProblems(storedWith({ orderField: "total" }))).toEqual([
      invalidAt("orderField"),
    ]);
    expect(listProblems(storedField(6, { nullable: true }))).toEqual([
      invalidAt("orderField"),
    ]);
  });

  test("a repeated key, option, total, search column, own index or then column is a duplicate", () => {
    const input = stored((def) => {
      const fields = def.fields as Record<string, unknown>[];
      fields.push({ key: "note", label: "Note again", type: "text" });
      (fields[1].options as unknown[]).push({ value: "open", label: "Open 2" });
      def.totals = ["total", "total"];
      def.search = ["note", "note"];
      def.textIndexes = ["note", "note"];
      def.arrayIndexes = ["tags", "tags"];
      def.indexes = [
        {
          equals: ["status", "status"],
          sort: "created_at",
          then: ["total", "total"],
        },
      ];
    });
    expect(listProblems(input)).toEqual([
      {
        code: "stored_duplicate",
        params: { path: "fields.1.options.2.value", value: "open" },
      },
      {
        code: "stored_duplicate",
        params: { path: "fields.10.key", value: "note" },
      },
      {
        code: "stored_duplicate",
        params: { path: "totals.1", value: "total" },
      },
      { code: "stored_duplicate", params: { path: "search.1", value: "note" } },
      {
        code: "stored_duplicate",
        params: { path: "textIndexes.1", value: "note" },
      },
      {
        code: "stored_duplicate",
        params: { path: "arrayIndexes.1", value: "tags" },
      },
      {
        code: "stored_duplicate",
        params: { path: "indexes.0.then.1", value: "total" },
      },
    ]);
  });

  test("a list over its cap is refused with the cap", () => {
    const many = (count: number, value: unknown) =>
      Array.from({ length: count }, () => value);
    const cases: [Record<string, unknown>, string, number][] = [
      [storedWith({ fields: many(201, {}) }), "fields", 200],
      [storedWith({ totals: many(21, "total") }), "totals", 20],
      [storedWith({ search: many(21, "note") }), "search", 20],
      [storedWith({ indexes: many(101, {}) }), "indexes", 100],
      [storedWith({ textIndexes: many(51, "note") }), "textIndexes", 50],
      [storedWith({ arrayIndexes: many(51, "tags") }), "arrayIndexes", 50],
      [storedField(7, { options: many(501, {}) }), "fields.7.options", 500],
      [
        storedField(7, {
          tones: Object.fromEntries(
            many(501, "info").map((tone, index) => [`tone_${index}`, tone]),
          ),
        }),
        "fields.7.tones",
        500,
      ],
    ];
    for (const [input, path, max] of cases) {
      expect(listProblems(input)).toEqual([
        { code: "stored_too_many", params: { path, max } },
      ]);
    }
  });

  test("an index pages by at most the sort maximum, so then holds one column fewer", () => {
    const then = Array.from({ length: SORT_MAX }, () => "total");
    const input = storedWith({
      indexes: [{ equals: [], sort: "created_at", then }],
    });
    expect(listProblems(input)).toEqual([
      {
        code: "stored_too_many",
        params: { path: "indexes.0.then", max: SORT_MAX - 1 },
      },
    ]);
  });

  test("an index needs its equals list and a sort, and its flags are booleans", () => {
    const input = stored((def) => {
      def.indexes = [
        "x",
        { sort: "created_at" },
        { equals: [] },
        {
          equals: [7],
          sort: "created_at",
          range: "yes",
          multi: 1,
          empty: "note",
        },
      ];
    });
    expect(listProblems(input)).toEqual([
      invalidAt("indexes.0"),
      invalidAt("indexes.1.equals"),
      invalidAt("indexes.2.sort"),
      invalidAt("indexes.3.equals.0"),
      invalidAt("indexes.3.range"),
      invalidAt("indexes.3.multi"),
      invalidAt("indexes.3.empty"),
    ]);
  });

  test("every problem is collected, up to fifty", () => {
    const few = storedWith({ id: "", extra: 1, orderField: "gone" });
    expect(listProblems(few).map((problem) => problem.code)).toEqual([
      "stored_unknown_key",
      "stored_invalid",
      "stored_unknown_field",
    ]);
    const many = stored((def) => {
      for (let index = 0; index < 80; index += 1) {
        def[`extra_${index}`] = index;
      }
    });
    const problems = listProblems(many);
    expect(problems).toHaveLength(50);
    expect(problems[49]).toEqual(unknownKeyAt("extra_49"));
  });
});

describe("a stored def that reads cleanly must also suit its indexes", () => {
  function indexProblem(code: string, params: Record<string, string>): Problem {
    return { code, params };
  }

  test("a nullable field is not a keyset sort", () => {
    expect(
      listProblems(storedWith({ indexes: [{ equals: [], sort: "note" }] })),
    ).toEqual([
      indexProblem("index_nullable_sort", {
        path: "indexes.0.sort",
        field: "note",
      }),
    ]);
  });

  test("a range needs a sort whose type has one", () => {
    expect(
      listProblems(
        storedWith({
          indexes: [{ equals: [], sort: "customer_name", range: true }],
        }),
      ),
    ).toEqual([
      indexProblem("index_no_range", {
        path: "indexes.0.range",
        field: "customer_name",
        type: "text",
      }),
    ]);
  });

  test("the sort is not also an equality", () => {
    expect(
      listProblems(
        storedWith({ indexes: [{ equals: ["status"], sort: "status" }] }),
      ),
    ).toEqual([
      indexProblem("index_sort_is_equality", {
        path: "indexes.0.sort",
        field: "status",
      }),
    ]);
  });

  test("an array is neither a sort nor an equality", () => {
    expect(
      listProblems(storedWith({ indexes: [{ equals: [], sort: "tags" }] })),
    ).toEqual([
      indexProblem("index_array_sort", {
        path: "indexes.0.sort",
        field: "tags",
      }),
    ]);
    expect(
      listProblems(
        storedWith({ indexes: [{ equals: ["tags"], sort: "created_at" }] }),
      ),
    ).toEqual([
      indexProblem("index_array_equality", {
        path: "indexes.0.equals.0",
        field: "tags",
      }),
    ]);
  });

  test("a then column is a non-null, orderable column not already in the index", () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [
        { equals: [], sort: "created_at", then: ["note"] },
        "index_nullable_sort",
        "note",
      ],
      [
        { equals: [], sort: "created_at", then: ["tags"] },
        "index_array_sort",
        "tags",
      ],
      [
        { equals: ["status"], sort: "created_at", then: ["status"] },
        "index_then_repeats",
        "status",
      ],
      [
        { equals: [], sort: "created_at", then: ["created_at"] },
        "index_then_repeats",
        "created_at",
      ],
      [
        { equals: [], sort: "created_at", then: ["id"] },
        "index_then_repeats",
        "id",
      ],
    ];
    for (const [index, code, field] of cases) {
      expect(listProblems(storedWith({ indexes: [index] }))).toEqual([
        indexProblem(code, { path: "indexes.0.then.0", field }),
      ]);
    }
  });

  test("an empty column is nullable and neither an equality nor the sort", () => {
    expect(
      listProblems(
        storedWith({
          indexes: [{ equals: [], sort: "created_at", empty: ["total"] }],
        }),
      ),
    ).toEqual([
      indexProblem("index_never_empty", {
        path: "indexes.0.empty.0",
        field: "total",
      }),
    ]);
    expect(
      listProblems(
        storedWith({
          indexes: [{ equals: ["note"], sort: "created_at", empty: ["note"] }],
        }),
      ),
    ).toEqual([
      indexProblem("index_empty_is_filtered", {
        path: "indexes.0.empty.0",
        field: "note",
      }),
    ]);
  });

  test("the same index declared twice is a duplicate", () => {
    const index = { equals: ["status"], sort: "created_at" };
    expect(listProblems(storedWith({ indexes: [index, index] }))).toEqual([
      indexProblem("index_duplicate", {
        path: "indexes.1",
        value: "status|created_at",
      }),
    ]);
  });

  test("a text index names a text field without options, an array index an array", () => {
    expect(listProblems(storedWith({ textIndexes: ["status"] }))).toEqual([
      indexProblem("index_not_text", {
        path: "textIndexes.0",
        field: "status",
      }),
    ]);
    expect(listProblems(storedWith({ arrayIndexes: ["note"] }))).toEqual([
      indexProblem("index_not_array", {
        path: "arrayIndexes.0",
        field: "note",
      }),
    ]);
  });

  test("index problems are capped at fifty too", () => {
    const indexes = Array.from({ length: 60 }, () => ({
      equals: [],
      sort: "note",
    }));
    expect(listProblems(storedWith({ indexes }))).toHaveLength(50);
  });
});

describe("a host limits the fields a stored def may name", () => {
  test("a field outside the list is an unknown field, and the def is refused", () => {
    const allowed = FULL_DEF.fields.map((field) => field.key);
    expect(normalizeStoredGridDef(FULL_DEF, { fields: allowed }).ok).toBe(true);
    const result = normalizeStoredGridDef(FULL_DEF, {
      fields: allowed.filter((key) => key !== "note"),
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems).toContainEqual({
      code: "stored_unknown_field",
      params: { path: "fields.7.key", field: "note" },
    });
  });
});
