import { describe, expect, test } from "bun:test";

import { listFilterChips } from "./chips.ts";
import type {
  BaseFieldDef,
  GridRow,
  IndexedGridDef,
  SortDirection,
} from "./grid-def.ts";
import type { Filter, QueryState } from "./query-state.ts";
import { createTestSource } from "./grid-def.fixture.ts";
import {
  gridDefCapabilities,
  indexId,
  isQueryBudgeted,
  isQueryRunnable,
  planQuery,
} from "./indexes.ts";
import { toLiteralQuery, withLiteralFilters } from "./literal-filters.ts";
import { createMemorySource, memoryCapabilities } from "./memory-source.ts";
import {
  FILTER_OPS,
  getOperatorShape,
  isFieldOp,
  isFilterOp,
  isLiteralOp,
  listFieldOps,
  listFixedValues,
  resolveFieldKind,
  type FilterOp,
} from "./operators.ts";
import {
  applyAction,
  defaultQuery,
  explainUnavailable,
  listOffers,
  type OpOffer,
} from "./query-actions.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import { checkFilterOps, validateQueryValues } from "./query-validate.ts";
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
    { equals: ["folder_id"], sort: "created_at", blank: ["deleted_at"] },
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

function getDefField(key: string): BaseFieldDef {
  const field = DEF.fields.find((item) => item.key === key);
  if (!field) {
    throw new Error(key);
  }
  return field;
}

function one(field: string, op: FilterOp, value: string): Filter {
  return { field, op, value } as Filter;
}

function pair(field: string, op: FilterOp, min: string, max: string): Filter {
  return { field, op, min, max } as Filter;
}

function list(field: string, op: FilterOp, values: (string | null)[]): Filter {
  return { field, op, values } as Filter;
}

function none(field: string, op: FilterOp): Filter {
  return { field, op } as Filter;
}

function withFilters(
  filters: Filter[],
  sort = "created_at",
  direction: SortDirection = "desc",
): QueryState {
  return { ...BASE, filters, sort: { field: sort, direction } };
}

function plan(filters: Filter[], sort?: string) {
  return planQuery(DEF.indexes, withFilters(filters, sort), DEF);
}

type Tier = "index" | "budgeted" | "narrowed" | "none";

function resolveTier(
  filters: Filter[],
  sort?: string,
  def: IndexedGridDef = DEF,
): Tier {
  const query = toLiteralQuery(def, withFilters(filters, sort), null);
  const result = planQuery(def.indexes, query, def);
  if (!isQueryRunnable(def, query) || !result) {
    return "none";
  }
  if (result.narrowed) {
    return "narrowed";
  }
  return result.budgeted ? "budgeted" : "index";
}

describe("the operator table", () => {
  test("holds the 18 operators in their agreed order", () => {
    expect(FILTER_OPS).toEqual([
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "greater_than",
      "greater_or_equal",
      "less_than",
      "less_or_equal",
      "between",
      "not_between",
      "in_period",
      "any_of",
      "none_of",
      "all_of",
      "blank",
      "not_blank",
    ]);
    expect(isFilterOp("between")).toBe(true);
    expect(isFilterOp("like")).toBe(false);
    expect(isFilterOp("toString")).toBe(false);
  });

  test("gives each operator the shape of its value", () => {
    expect(getOperatorShape("equals")).toBe("one");
    expect(getOperatorShape("contains")).toBe("one");
    expect(getOperatorShape("less_or_equal")).toBe("one");
    expect(getOperatorShape("between")).toBe("pair");
    expect(getOperatorShape("not_between")).toBe("pair");
    expect(getOperatorShape("any_of")).toBe("list");
    expect(getOperatorShape("all_of")).toBe("list");
    expect(getOperatorShape("in_period")).toBe("preset");
    expect(getOperatorShape("blank")).toBe("none");
    expect(getOperatorShape("not_blank")).toBe("none");
  });

  test("reads a field's kind from its type, options and lookup", () => {
    const kind = (field: Partial<BaseFieldDef>) =>
      resolveFieldKind({ key: "x", label: "X", type: "text", ...field });
    expect(kind({})).toBe("text");
    expect(kind({ options: [{ value: "a", label: "A" }] })).toBe("choice");
    expect(kind({ lookup: { labelField: "x_name" } })).toBe("choice");
    expect(kind({ type: "enum" })).toBe("choice");
    expect(kind({ type: "boolean" })).toBe("choice");
    expect(kind({ type: "id" })).toBe("choice");
    expect(kind({ type: "integer" })).toBe("number");
    expect(kind({ type: "decimal" })).toBe("number");
    expect(kind({ type: "money" })).toBe("number");
    expect(kind({ type: "date" })).toBe("date");
    expect(kind({ type: "datetime" })).toBe("date");
    expect(kind({ type: "array" })).toBe("array");
    expect(kind({ type: "array", options: [{ value: "a", label: "A" }] })).toBe(
      "array",
    );
  });
});

describe("the operators a field can take", () => {
  const ops = (key: string) => listFieldOps(getDefField(key));
  const compared: FilterOp[] = [
    "equals",
    "not_equals",
    "greater_than",
    "greater_or_equal",
    "less_than",
    "less_or_equal",
    "between",
    "not_between",
  ];

  test("a text field matches text, and blank only when nullable", () => {
    const text: FilterOp[] = [
      "equals",
      "not_equals",
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
    ];
    expect(ops("name")).toEqual(text);
    expect(ops("note")).toEqual([...text, "blank", "not_blank"]);
  });

  test("a number compares, and a date adds a period", () => {
    expect(ops("size")).toEqual(compared);
    expect(ops("rate")).toEqual([...compared, "blank", "not_blank"]);
    expect(ops("created_at")).toEqual([...compared, "in_period"]);
    expect(ops("due")).toEqual([
      ...compared,
      "in_period",
      "blank",
      "not_blank",
    ]);
  });

  test("a choice is any or none of its values", () => {
    expect(ops("starred")).toEqual(["any_of", "none_of"]);
    expect(ops("folder_id")).toEqual([
      "any_of",
      "none_of",
      "blank",
      "not_blank",
    ]);
  });

  test("an array holds any, all or none, and is blank but never not blank", () => {
    expect(ops("tags")).toEqual(["any_of", "none_of", "all_of", "blank"]);
    expect(listFieldOps({ key: "x", label: "X", type: "array" })).toEqual([
      "any_of",
      "none_of",
      "all_of",
    ]);
  });

  test("isFieldOp agrees with the list", () => {
    expect(isFieldOp(getDefField("size"), "between")).toBe(true);
    expect(isFieldOp(getDefField("size"), "contains")).toBe(false);
    expect(isFieldOp(getDefField("name"), "blank")).toBe(false);
    expect(isFieldOp(getDefField("tags"), "not_blank")).toBe(false);
  });

  test("a period, and none of a field's fixed values, are the browser's to resolve", () => {
    expect(listFixedValues(getDefField("starred"))).toEqual(["true", "false"]);
    expect(listFixedValues(getDefField("folder_id"))).toBeNull();
    expect(isLiteralOp(getDefField("due"), "in_period")).toBe(true);
    expect(isLiteralOp(getDefField("starred"), "none_of")).toBe(true);
    expect(isLiteralOp(getDefField("starred"), "any_of")).toBe(false);
    expect(isLiteralOp(getDefField("folder_id"), "none_of")).toBe(false);
    const options = [{ value: "a", label: "A" }];
    expect(
      isLiteralOp({ key: "x", label: "X", type: "array", options }, "none_of"),
    ).toBe(false);
  });
});

describe("the URL of every operator", () => {
  const filters: Filter[] = [
    one("name", "equals", "Invoice"),
    one("note", "not_equals", "n/a"),
    one("note", "contains", "a..b"),
    one("name", "not_contains", "draft"),
    one("name", "starts_with", "inv"),
    one("note", "ends_with", ".pdf"),
    one("size", "greater_than", "5"),
    one("size", "greater_or_equal", "6"),
    one("size", "less_than", "20"),
    one("size", "less_or_equal", "19"),
    pair("rate", "between", "1.5", "2.5"),
    pair("size", "not_between", "10", "12"),
    { field: "due", op: "in_period", preset: "last-7-days" },
    list("folder_id", "any_of", [FOLDER, null]),
    list("starred", "none_of", ["true"]),
    list("tags", "all_of", ["red", "blue"]),
    none("note", "blank"),
    none("rate", "not_blank"),
  ];
  const query: QueryState = { ...BASE, filters };

  test("each filter is one key per field and operator, and reads back as itself", () => {
    const params = encodeQuery(DEF, query);
    expect(params.get("f.name.equals")).toBe("Invoice");
    expect(params.get("f.note.not_equals")).toBe("n/a");
    expect(params.get("f.note.contains")).toBe("a..b");
    expect(params.get("f.name.not_contains")).toBe("draft");
    expect(params.get("f.name.starts_with")).toBe("inv");
    expect(params.get("f.note.ends_with")).toBe(".pdf");
    expect(params.get("f.size.greater_than")).toBe("5");
    expect(params.get("f.size.greater_or_equal")).toBe("6");
    expect(params.get("f.size.less_than")).toBe("20");
    expect(params.get("f.size.less_or_equal")).toBe("19");
    expect(params.get("f.rate.between")).toBe("1.5..2.5");
    expect(params.get("f.size.not_between")).toBe("10..12");
    expect(params.get("f.due.in_period")).toBe("last-7-days");
    expect(params.getAll("f.folder_id.any_of")).toEqual([FOLDER, "_empty"]);
    expect(params.get("f.starred.none_of")).toBe("true");
    expect(params.getAll("f.tags.all_of")).toEqual(["red", "blue"]);
    expect(params.get("f.note.blank")).toBe("");
    expect(params.get("f.rate.not_blank")).toBe("");
    expect(decodeQuery(DEF, params)).toEqual(query);
  });

  test("a field takes several filters, of one operator or of many", () => {
    const several: QueryState = {
      ...BASE,
      filters: [
        one("size", "greater_than", "5"),
        one("size", "greater_than", "9"),
        one("name", "contains", "a"),
        one("name", "not_contains", "b"),
      ],
    };
    const params = encodeQuery(DEF, several);
    expect(params.getAll("f.size.greater_than")).toEqual(["5", "9"]);
    expect(decodeQuery(DEF, params)).toEqual(several);
  });

  test("a repeat is read once, and a value the operator cannot hold is dropped", () => {
    const decoded = decodeQuery(
      DEF,
      new URLSearchParams(
        [
          "f.name.contains=a",
          "f.name.contains=a",
          "f.tags.any_of=x",
          "f.tags.any_of=x",
          "f.note.blank=",
          "f.note.blank=1",
          "f.size.between=5..",
          "f.size.between=..9",
          "f.size.greater_than=",
          "f.due.in_period=someday",
        ].join("&"),
      ),
    );
    expect(decoded.filters).toEqual([
      one("name", "contains", "a"),
      list("tags", "any_of", ["x"]),
      none("note", "blank"),
    ]);
  });

  test("the old keys and unknown operators are ignored", () => {
    const decoded = decodeQuery(
      DEF,
      new URLSearchParams(
        [
          "f.starred=true",
          "f.folder_id=_not_empty",
          "f.starred=!true",
          "r.size=5..9",
          "c.name=inv",
          "nc.name=x",
          "sw.name=x",
          "ew.name=x",
          "ne.name=x",
          "o.tags=red",
          "f.size.like=5",
          "f..equals=5",
        ].join("&"),
      ),
    );
    expect(decoded).toEqual(BASE);
  });

  test("every key a query writes is one the capabilities list", () => {
    const capabilities = withLiteralFilters(
      DEF,
      createTestSource(CAPABILITIES),
    ).capabilities;
    const names = listQueryKeys(capabilities).map((key) => key.name);
    for (const name of encodeQuery(DEF, query).keys()) {
      expect(names).toContain(name);
    }
    expect(names).toContain("f.labels.any_of");
    expect(names).not.toContain("f.tags.equals");
    expect(names).not.toContain("f.id.any_of");
  });
});

describe("the values of each operator", () => {
  const valid = (...filters: Filter[]) =>
    validateQueryValues(DEF, { ...BASE, filters });

  test("a boolean is true or false", () => {
    expect(valid(list("starred", "any_of", ["true"]))).toBeNull();
    expect(valid(list("starred", "any_of", ["yes"]))?.code).toBe(
      "invalid_value",
    );
  });

  test("a date is a calendar day and a decimal takes a fraction", () => {
    const due = (value: string) => valid(one("due", "greater_or_equal", value));
    expect(due("2026-02-28")).toBeNull();
    expect(due("2026-02-28T00:00:00Z")?.code).toBe("invalid_value");
    expect(due("2026-13-01")?.code).toBe("invalid_value");
    expect(due("2026-02-31")?.code).toBe("invalid_value");
    expect(due("2028-02-29")).toBeNull();
    const rate = (value: string) => valid(one("rate", "less_than", value));
    expect(rate("-12.375")).toBeNull();
    expect(rate("1e3")?.code).toBe("invalid_value");
    expect(valid(one("size", "equals", "1.5"))?.code).toBe("invalid_value");
  });

  test("a datetime takes a day or an instant", () => {
    expect(valid(one("created_at", "equals", "2026-03-03"))).toBeNull();
    expect(
      valid(one("created_at", "less_than", "2026-03-03T10:00:00Z")),
    ).toBeNull();
    expect(valid(one("created_at", "less_than", "soon"))?.code).toBe(
      "invalid_value",
    );
  });

  test("both sides of a pair are checked", () => {
    expect(valid(pair("size", "between", "1", "9"))).toBeNull();
    expect(valid(pair("size", "not_between", "1", "x"))?.code).toBe(
      "invalid_value",
    );
  });

  test("a list is never empty, stays under the cap, and holds a blank only when the field may be blank", () => {
    expect(valid(list("tags", "any_of", ["red"]))).toBeNull();
    expect(valid(list("tags", "any_of", []))?.code).toBe("invalid_value");
    expect(
      valid(
        list(
          "tags",
          "any_of",
          Array.from({ length: 21 }, (_, at) => `t${at}`),
        ),
      )?.code,
    ).toBe("too_many_values");
    expect(valid(list("folder_id", "any_of", [FOLDER, null]))).toBeNull();
    expect(valid(list("starred", "any_of", [null]))?.code).toBe(
      "invalid_value",
    );
    expect(valid(list("folder_id", "none_of", ["not-a-uuid"]))?.code).toBe(
      "invalid_value",
    );
  });

  test("a text value is trimmed, non-empty and capped", () => {
    expect(valid(one("name", "starts_with", "a"))).toBeNull();
    expect(valid(one("name", "contains", "   "))?.code).toBe("invalid_value");
    expect(valid(one("name", "contains", "a".repeat(81)))?.code).toBe(
      "invalid_value",
    );
  });

  test("an operator the field's kind does not take is refused by name", () => {
    expect(valid(one("size", "contains", "1"))).toEqual({
      code: "invalid_op",
      params: { field: "size", op: "contains" },
    });
    expect(valid(list("name", "any_of", ["red"]))?.code).toBe("invalid_op");
    expect(valid(list("starred", "all_of", ["true"]))?.code).toBe("invalid_op");
    expect(valid(none("name", "blank"))?.code).toBe("invalid_op");
    expect(valid(none("tags", "not_blank"))?.code).toBe("invalid_op");
    expect(valid(one("name", "like" as FilterOp, "a"))).toEqual({
      code: "invalid_op",
      params: { field: "name", op: "like" },
    });
    expect(valid(one("nope", "equals", "a"))).toEqual({
      code: "unknown_field",
      params: { field: "nope" },
    });
  });

  test("one cap covers every filter", () => {
    const filters = (count: number) =>
      Array.from({ length: count }, () => one("name", "contains", "a"));
    expect(valid(...filters(20))).toBeNull();
    expect(valid(...filters(21))).toEqual({
      code: "too_many_filters",
      params: { max: 20 },
    });
    expect(checkFilterOps(DEF, { ...BASE, filters: filters(21) })).toEqual({
      code: "too_many_filters",
      params: { max: 20 },
    });
  });

  test("the server refuses a period and none of fixed values by name", () => {
    const check = (...filters: Filter[]) =>
      checkFilterOps(DEF, { ...BASE, filters });
    expect(check({ field: "due", op: "in_period", preset: "today" })).toEqual({
      code: "literal_required",
      params: { field: "due", op: "in_period" },
    });
    expect(check(list("starred", "none_of", ["true"]))).toEqual({
      code: "literal_required",
      params: { field: "starred", op: "none_of" },
    });
    expect(check(list("folder_id", "none_of", [FOLDER]))).toBeNull();
    expect(check(list("tags", "none_of", ["red"]))).toBeNull();
    expect(check(one("size", "contains", "1"))).toEqual({
      code: "invalid_op",
      params: { field: "size", op: "contains" },
    });
    expect(check(one("nope", "equals", "a"))).toBeNull();
  });
});

describe("the tier of every operator", () => {
  test("an equality field answers any of, blank and not blank from its index", () => {
    expect(resolveTier([list("starred", "any_of", ["true"])])).toBe("index");
    expect(resolveTier([list("folder_id", "any_of", [FOLDER, null])])).toBe(
      "index",
    );
    expect(resolveTier([none("folder_id", "blank")])).toBe("index");
    expect(resolveTier([none("folder_id", "not_blank")])).toBe("index");
  });

  test("none of fixed values is answered as the values it keeps", () => {
    expect(resolveTier([list("starred", "none_of", ["true"])])).toBe("index");
    expect(
      isQueryRunnable(DEF, withFilters([list("starred", "none_of", ["true"])])),
    ).toBe(false);
  });

  test("none of a lookup, and blank on a field no index holds, run narrowed", () => {
    expect(resolveTier([list("folder_id", "none_of", [FOLDER])])).toBe(
      "narrowed",
    );
    expect(resolveTier([none("note", "blank")])).toBe("narrowed");
    expect(resolveTier([none("note", "not_blank")])).toBe("narrowed");
    expect(resolveTier([none("rate", "blank")])).toBe("narrowed");
    expect(resolveTier([none("due", "not_blank")])).toBe("narrowed");
  });

  test("a partial index answers its fields only when they are blank", () => {
    const live = [
      list("folder_id", "any_of", [FOLDER]),
      none("deleted_at", "blank"),
    ];
    expect(plan(live)).toMatchObject({ narrowed: false });
    expect(plan(live)?.core.filters).toEqual(live);
    expect(
      resolveTier([
        list("folder_id", "any_of", [FOLDER]),
        none("deleted_at", "not_blank"),
      ]),
    ).toBe("narrowed");
    expect(CAPABILITIES.groupFields).not.toContain("deleted_at");
    expect(CAPABILITIES.filterOps.deleted_at).not.toContain("any_of");
    expect(CAPABILITIES.filterOps.deleted_at).toContain("blank");
    expect(
      isQueryRunnable(
        { ...DEF, search: ["name"] },
        { ...withFilters(live), search: "invoice" },
      ),
    ).toBe(true);
    expect(indexId(DEF.indexes[3])).toBe(
      "folder_id|created_at|empty:deleted_at",
    );
    expect(indexId(DEF.indexes[2])).toBe("folder_id|created_at");
  });

  test(
    "a partial index's blank field without its equality runs narrowed, like blank on any nullable field",
    () => {
      expect(resolveTier([none("deleted_at", "blank")])).toBe("narrowed");
      const under = {
        ...CONTEXT,
        narrowed: {
          limit: 100,
          and: { rows: 40, over: false, capped: false },
          or: null,
          andBasis: CAPABILITIES.narrowBasis(BASE),
          orBasis: "",
        },
      };
      expect(
        listOffers(DEF, BASE, under).filters.deleted_at.find(
          (offer) => offer.op === "blank",
        )?.offered,
      ).toBe(true);
    },
  );

  test("a bound on the sort of a range index is the index's own range", () => {
    for (const filter of [
      one("created_at", "equals", "2026-03-03"),
      one("created_at", "greater_than", "2026-01-01"),
      one("created_at", "greater_or_equal", "2026-01-01"),
      one("created_at", "less_than", "2026-01-01"),
      one("created_at", "less_or_equal", "2026-01-01"),
      pair("created_at", "between", "2026-01-01", "2026-02-01"),
    ]) {
      expect(resolveTier([filter])).toBe("index");
      expect(plan([filter])?.core.filters).toEqual([filter]);
    }
    expect(
      resolveTier([{ field: "created_at", op: "in_period", preset: "today" }]),
    ).toBe("index");
    expect(resolveTier([one("size", "greater_than", "5")], "size")).toBe(
      "index",
    );
    expect(resolveTier([one("size", "equals", "5")], "size")).toBe("index");
  });

  test("a bound off the sort, an exclusion and a second bound run narrowed", () => {
    expect(resolveTier([one("size", "greater_than", "5")])).toBe("narrowed");
    expect(resolveTier([one("rate", "greater_than", "1")])).toBe("narrowed");
    expect(resolveTier([one("created_at", "not_equals", "2026-01-01")])).toBe(
      "narrowed",
    );
    expect(
      resolveTier([
        pair("created_at", "not_between", "2026-01-01", "2026-02-01"),
      ]),
    ).toBe("narrowed");
    const excluded = plan([one("created_at", "not_equals", "2026-01-01")]);
    expect(excluded?.core.filters).toEqual([]);
    const first = one("created_at", "greater_or_equal", "2026-01-01");
    const second = one("created_at", "less_or_equal", "2026-06-01");
    const twice = plan([first, second]);
    expect(twice?.narrowed).toBe(true);
    expect(twice?.core.filters).toEqual([first]);
  });

  test("equals on a number in an index's equality lowers to that index", () => {
    const def: IndexedGridDef = {
      ...DEF,
      indexes: [
        { equals: [], sort: "created_at" },
        { equals: ["size"], sort: "created_at" },
        { equals: ["name"], sort: "created_at" },
      ],
    };
    expect(resolveTier([one("size", "equals", "5")], undefined, def)).toBe(
      "index",
    );
    expect(
      resolveTier([one("size", "greater_than", "5")], undefined, def),
    ).toBe("narrowed");
    expect(
      resolveTier([one("name", "equals", "Invoice")], undefined, def),
    ).toBe("index");
  });

  test("a text match on a field with its own index is budgeted, from three characters", () => {
    for (const op of ["contains", "starts_with", "ends_with"] as const) {
      expect(resolveTier([one("name", op, "inv")])).toBe("budgeted");
    }
    const filters = [one("name", "contains", "invoice")];
    expect(plan(filters)?.core.filters).toEqual(filters);
    expect(isQueryBudgeted(DEF, withFilters(filters))).toBe(true);
  });

  test("a negation, a short value, text equals or a field with no index runs narrowed", () => {
    for (const filter of [
      one("name", "not_contains", "invoice"),
      one("name", "not_equals", "invoice"),
      one("name", "equals", "invoice"),
      one("name", "contains", "in"),
      one("note", "contains", "invoice"),
    ]) {
      const narrowed = plan([filter]);
      expect(narrowed).toMatchObject({ narrowed: true, budgeted: false });
      expect(narrowed?.core.filters).toEqual([]);
    }
  });

  test("a budgeted filter beside a narrowed part joins the narrowed set", () => {
    expect(
      plan([one("name", "contains", "invoice"), one("note", "contains", "x")]),
    ).toMatchObject({ narrowed: true, budgeted: false });
    expect(
      plan([
        one("name", "contains", "invoice"),
        one("size", "greater_than", "1"),
      ]),
    ).toMatchObject({ narrowed: true, budgeted: false });
  });

  test("an array index answers any of and all of; the rest of an array runs narrowed", () => {
    expect(resolveTier([list("tags", "any_of", ["red"])])).toBe("budgeted");
    expect(resolveTier([list("tags", "all_of", ["red", "blue"])])).toBe(
      "budgeted",
    );
    expect(resolveTier([list("tags", "none_of", ["red"])])).toBe("narrowed");
    expect(resolveTier([none("tags", "blank")])).toBe("narrowed");
    expect(resolveTier([list("labels", "any_of", ["red"])])).toBe("narrowed");
    expect(resolveTier([list("labels", "all_of", ["red"])])).toBe("narrowed");
  });

  test("the search takes no text match or array filter beside it", () => {
    const def = { ...DEF, search: ["name"] };
    const search = (...filters: Filter[]) =>
      isQueryRunnable(def, { ...withFilters(filters), search: "invoice" });
    expect(search()).toBe(true);
    expect(search(list("starred", "any_of", ["true"]))).toBe(true);
    expect(search(one("name", "contains", "inv"))).toBe(false);
    expect(search(list("tags", "any_of", ["a"]))).toBe(false);
  });

  test("the capabilities list what some tier answers", () => {
    expect(CAPABILITIES.filterOps.starred).toEqual(["any_of"]);
    expect(CAPABILITIES.filterOps.folder_id).toEqual([
      "any_of",
      "none_of",
      "blank",
      "not_blank",
    ]);
    expect(CAPABILITIES.filterOps.tags).toEqual([
      "any_of",
      "none_of",
      "all_of",
      "blank",
    ]);
    expect(CAPABILITIES.filterOps.due).not.toContain("in_period");
    expect(CAPABILITIES.filterOps.id).toBeUndefined();
    expect(CAPABILITIES.groupFields).toContain("starred");
    const literal = withLiteralFilters(DEF, createTestSource(CAPABILITIES))
      .capabilities.filterOps;
    expect(literal.starred).toEqual(["any_of", "none_of"]);
    expect(literal.due).toContain("in_period");
    expect(literal.folder_id).toEqual(CAPABILITIES.filterOps.folder_id);
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
  const ids = async (...filters: Filter[]) => {
    const page = await source.fetchPage(
      withFilters(filters, "size", "asc"),
      50,
      signal,
    );
    return page.rows.map((row) => row.id);
  };
  const idsOr = async (...filters: Filter[]) => {
    const page = await source.fetchPage(
      { ...withFilters(filters, "size", "asc"), combine: "or" },
      50,
      signal,
    );
    return page.rows.map((row) => row.id);
  };

  test("the number operators, open bounds leaving the bound itself out", async () => {
    expect(await ids(one("size", "equals", "10"))).toEqual(["b"]);
    expect(await ids(one("size", "not_equals", "10"))).toEqual(["a", "c"]);
    expect(await ids(one("size", "greater_than", "5"))).toEqual(["b", "c"]);
    expect(await ids(one("size", "greater_or_equal", "5"))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await ids(one("size", "less_than", "20"))).toEqual(["a", "b"]);
    expect(await ids(one("size", "less_or_equal", "10"))).toEqual(["a", "b"]);
    expect(await ids(pair("size", "between", "5", "10"))).toEqual(["a", "b"]);
    expect(await ids(pair("size", "not_between", "6", "20"))).toEqual(["a"]);
  });

  test("an exclusion is everything outside it, a blank cell included", async () => {
    expect(await ids(pair("rate", "not_between", "1", "2"))).toEqual([
      "b",
      "c",
    ]);
    expect(await ids(pair("rate", "between", "1", "2"))).toEqual(["a"]);
    expect(await ids(one("rate", "not_equals", "1.5"))).toEqual(["b", "c"]);
  });

  test("blank and not blank on a number, a text and a lookup", async () => {
    expect(await ids(none("rate", "blank"))).toEqual(["c"]);
    expect(await ids(none("rate", "not_blank"))).toEqual(["a", "b"]);
    expect(await ids(none("note", "blank"))).toEqual(["b"]);
    expect(await ids(none("note", "not_blank"))).toEqual(["a", "c"]);
    expect(await ids(none("folder_id", "blank"))).toEqual(["c"]);
    expect(await ids(none("folder_id", "not_blank"))).toEqual(["a", "b"]);
  });

  test("two filters on one field both apply", async () => {
    expect(
      await ids(
        one("size", "greater_or_equal", "5"),
        one("size", "not_equals", "10"),
      ),
    ).toEqual(["a", "c"]);
    expect(
      await ids(
        one("name", "contains", "invoice"),
        one("name", "not_contains", "april"),
      ),
    ).toEqual(["a"]);
  });

  test("a date field compares calendar days", async () => {
    expect(await ids(one("due", "equals", "2026-03-01"))).toEqual(["a"]);
    expect(await ids(one("due", "not_equals", "2026-03-01"))).toEqual([
      "b",
      "c",
    ]);
    expect(await ids(one("due", "greater_than", "2026-03-01"))).toEqual(["b"]);
    expect(await ids(one("due", "less_than", "2026-04-15"))).toEqual(["a"]);
  });

  test("a day on a datetime is the whole day", async () => {
    expect(await ids(one("created_at", "equals", "2026-03-01"))).toEqual(["a"]);
    expect(await ids(one("created_at", "not_equals", "2026-03-01"))).toEqual([
      "b",
      "c",
    ]);
    expect(await ids(one("created_at", "greater_than", "2026-03-01"))).toEqual([
      "b",
      "c",
    ]);
    expect(await ids(one("created_at", "less_or_equal", "2026-04-15"))).toEqual(
      ["a", "b"],
    );
    expect(
      await ids(pair("created_at", "between", "2026-03-01", "2026-04-15")),
    ).toEqual(["a", "b"]);
  });

  test("the text operators ignore case, and a negation keeps a blank cell", async () => {
    expect(await ids(one("name", "starts_with", "INV"))).toEqual(["a", "b"]);
    expect(await ids(one("name", "ends_with", "april"))).toEqual(["b"]);
    expect(await ids(one("note", "contains", "PDF"))).toEqual(["a"]);
    expect(await ids(one("note", "not_contains", "pdf"))).toEqual(["b", "c"]);
    expect(await ids(one("note", "not_equals", "draft"))).toEqual(["a", "b"]);
    expect(await ids(one("name", "not_equals", "receipt"))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await ids(one("name", "equals", "Receipt"))).toEqual(["c"]);
  });

  test("a choice is any or none of its values, a blank one included when asked", async () => {
    expect(await ids(list("starred", "any_of", ["true"]))).toEqual(["a"]);
    expect(await ids(list("starred", "any_of", ["false"]))).toEqual(["b", "c"]);
    expect(await ids(list("starred", "none_of", ["true"]))).toEqual(["b", "c"]);
    expect(await ids(list("folder_id", "any_of", [null]))).toEqual(["c"]);
    expect(await ids(list("folder_id", "any_of", [FOLDER, null]))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await ids(list("folder_id", "none_of", [FOLDER]))).toEqual(["c"]);
  });

  test("an array holds any, all or none of the values, and an empty list is blank", async () => {
    expect(await ids(list("tags", "any_of", ["blue", "green"]))).toEqual([
      "a",
      "b",
    ]);
    expect(await ids(list("labels", "any_of", ["x"]))).toEqual(["b"]);
    expect(await ids(list("tags", "all_of", ["red", "blue"]))).toEqual(["a"]);
    expect(await ids(list("tags", "all_of", ["red", "green"]))).toEqual([]);
    expect(await ids(list("tags", "none_of", ["red"]))).toEqual(["b", "c"]);
    expect(await ids(none("tags", "blank"))).toEqual(["c"]);
    expect(await ids(none("labels", "blank"))).toEqual(["a", "c"]);
  });

  test("match any ORs every filter", async () => {
    expect(
      await idsOr(
        one("name", "starts_with", "rec"),
        list("tags", "any_of", ["red"]),
      ),
    ).toEqual(["a", "c"]);
  });

  test("a client grid offers every operator", () => {
    const capabilities = memoryCapabilities(DEF);
    for (const field of DEF.fields) {
      expect(capabilities.filterOps[field.key]).toEqual(
        listFieldOps(field).filter((op) => !isLiteralOp(field, op)),
      );
    }
    const literal = source.capabilities.filterOps;
    expect(literal.due).toEqual(listFieldOps(getDefField("due")));
    expect(literal.starred).toEqual(["any_of", "none_of"]);
    const offers = listOffers(DEF, BASE, {
      capabilities: source.capabilities,
      allSearchMatchesLoaded: false,
      narrowed: null,
    });
    for (const field of DEF.fields) {
      expect(offers.filters[field.key].map((offer) => offer.op)).toEqual(
        listFieldOps(field),
      );
      expect(offers.filters[field.key].every((offer) => offer.offered)).toBe(
        true,
      );
    }
  });
});

describe("the actions of a filter", () => {
  const memory = {
    capabilities: memoryCapabilities(DEF),
    allSearchMatchesLoaded: false,
    narrowed: null,
  };
  const run = (query: QueryState, action: Parameters<typeof applyAction>[2]) =>
    applyAction(DEF, query, action, memory);

  test("setFilter replaces the field's filter at a position, else adds one at the end", () => {
    const first = run(BASE, {
      type: "setFilter",
      filter: one("name", "contains", "a"),
    });
    const second = run(first, {
      type: "setFilter",
      filter: one("name", "not_contains", "b"),
      at: 1,
    });
    expect(second.filters).toEqual([
      one("name", "contains", "a"),
      one("name", "not_contains", "b"),
    ]);
    const replaced = run(second, {
      type: "setFilter",
      filter: one("name", "ends_with", "c"),
      at: 0,
    });
    expect(replaced.filters).toEqual([
      one("name", "ends_with", "c"),
      one("name", "not_contains", "b"),
    ]);
    const defaulted = run(replaced, {
      type: "setFilter",
      filter: one("name", "equals", "d"),
    });
    expect(defaulted.filters[0]).toEqual(one("name", "equals", "d"));
  });

  test("a position keeps the other fields' filters where they are", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        one("size", "greater_or_equal", "1"),
        one("rate", "greater_or_equal", "1"),
        one("size", "not_equals", "5"),
      ],
    };
    const replaced = run(query, {
      type: "setFilter",
      filter: one("size", "less_or_equal", "3"),
      at: 1,
    });
    expect(replaced.filters).toEqual([
      query.filters[0],
      query.filters[1],
      one("size", "less_or_equal", "3"),
    ]);
  });

  test("removeFilter takes one filter by position, or every filter on the field", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        one("size", "greater_or_equal", "1"),
        one("name", "contains", "a"),
        one("size", "not_equals", "5"),
      ],
    };
    expect(
      run(query, { type: "removeFilter", field: "size", at: 0 }).filters,
    ).toEqual([one("name", "contains", "a"), one("size", "not_equals", "5")]);
    expect(run(query, { type: "removeFilter", field: "size" }).filters).toEqual(
      [one("name", "contains", "a")],
    );
  });

  test("a list is set without repeats, trimmed by value and gone with its last value", () => {
    const set = run(BASE, {
      type: "setFilter",
      filter: list("tags", "any_of", ["a", "b", "a"]),
    });
    expect(set.filters).toEqual([list("tags", "any_of", ["a", "b"])]);
    const less = run(set, {
      type: "removeFilterValue",
      field: "tags",
      at: 0,
      value: "a",
    });
    expect(less.filters).toEqual([list("tags", "any_of", ["b"])]);
    expect(
      run(less, { type: "removeFilterValue", field: "tags", at: 0, value: "b" })
        .filters,
    ).toEqual([]);
    expect(
      run(BASE, { type: "setFilter", filter: list("tags", "any_of", []) })
        .filters,
    ).toEqual([]);
  });

  test("none of every fixed value is refused, since nothing would be left", () => {
    const capabilities = withLiteralFilters(
      DEF,
      createMemorySource(DEF, ROWS),
    ).capabilities;
    const context = { ...memory, capabilities };
    const kept = applyAction(
      DEF,
      BASE,
      { type: "setFilter", filter: list("starred", "none_of", ["true"]) },
      context,
    );
    expect(kept.filters).toEqual([list("starred", "none_of", ["true"])]);
    const all = applyAction(
      DEF,
      BASE,
      {
        type: "setFilter",
        filter: list("starred", "none_of", ["true", "false"]),
      },
      context,
    );
    expect(all).toBe(BASE);
  });

  test("each filter has a chip that clears just itself", () => {
    const query: QueryState = {
      ...BASE,
      filters: [
        one("size", "greater_than", "1"),
        one("size", "not_equals", "5"),
        one("name", "starts_with", "inv"),
        list("tags", "any_of", ["red", null]),
        none("note", "blank"),
      ],
    };
    const chips = listFilterChips(DEF, query);
    expect(chips.map((chip) => chip.id)).toEqual([
      "filter:size:greater_than",
      "filter:size:not_equals:1",
      "filter:name:starts_with",
      "filter:tags:any_of",
      "filter:note:blank",
      "sort",
    ]);
    expect(chips[0]).toMatchObject({ op: "greater_than", operands: ["1"] });
    expect(chips[1]).toMatchObject({
      op: "not_equals",
      operands: ["5"],
      clear: { type: "removeFilter", field: "size", at: 1 },
    });
    expect(chips[2]).toMatchObject({
      op: "starts_with",
      operands: ["inv"],
      clear: { type: "removeFilter", field: "name", at: 0 },
    });
    expect(chips[3]).toMatchObject({
      op: "any_of",
      operands: [],
      values: [
        {
          value: "red",
          text: "red",
          clear: {
            type: "removeFilterValue",
            field: "tags",
            at: 0,
            value: "red",
          },
        },
        {
          value: null,
          text: null,
          clear: {
            type: "removeFilterValue",
            field: "tags",
            at: 0,
            value: null,
          },
        },
      ],
    });
    expect(chips[4]).toMatchObject({ op: "blank", operands: [], values: [] });
  });
});

describe("the offers of a server grid", () => {
  const getOffer = (
    offers: ReturnType<typeof listOffers>,
    field: string,
    op: FilterOp,
  ): OpOffer | undefined =>
    offers.filters[field]?.find((offer) => offer.op === op);

  test("a text match on an indexed field is offered without a narrowed size, from three characters", () => {
    const offers = listOffers(DEF, BASE, CONTEXT);
    expect(getOffer(offers, "name", "contains")).toMatchObject({
      offered: true,
      reason: null,
      minLength: 3,
    });
    expect(getOffer(offers, "tags", "any_of")?.offered).toBe(true);
    expect(getOffer(offers, "tags", "all_of")?.offered).toBe(true);
    for (const [field, op] of [
      ["name", "not_contains"],
      ["name", "equals"],
      ["note", "contains"],
      ["note", "blank"],
      ["tags", "none_of"],
      ["labels", "any_of"],
      ["folder_id", "none_of"],
    ] as const) {
      const offer = getOffer(offers, field, op);
      expect(offer?.offered).toBe(false);
      expect(offer?.reason?.code).toBe("narrow_counting");
    }
    expect(getOffer(offers, "starred", "any_of")?.offered).toBe(true);
    expect(getOffer(offers, "created_at", "between")?.offered).toBe(true);
    expect(offers.filters.id).toBeUndefined();
  });

  test("a narrowed set over the limit holds every narrowed operator with its size", () => {
    const basis = CAPABILITIES.narrowBasis(
      withFilters([one("note", "contains", "x")]),
    );
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
    const held = listOffers(DEF, BASE, over);
    expect(getOffer(held, "name", "contains")?.offered).toBe(true);
    expect(getOffer(held, "created_at", "greater_than")?.offered).toBe(true);
    expect(getOffer(held, "note", "contains")).toMatchObject({
      offered: false,
      reason: { code: "narrow_first", rows: 100, capped: true },
    });
    expect(
      explainUnavailable(
        DEF,
        BASE,
        { kind: "filter", field: "created_at", op: "not_between" },
        over,
      ),
    ).toMatchObject({ code: "narrow_first", field: "created_at", rows: 100 });
    const under = listOffers(DEF, BASE, sized(40, false));
    for (const [field, offers] of Object.entries(under.filters)) {
      for (const offer of offers.filter(
        (item) => field !== "deleted_at" || item.op !== "blank",
      )) {
        expect({ field, op: offer.op, offered: offer.offered }).toEqual({
          field,
          op: offer.op,
          offered: true,
        });
      }
    }
    const indexed = applyAction(
      DEF,
      BASE,
      { type: "setFilter", filter: one("name", "contains", "invoice") },
      CONTEXT,
    );
    expect(indexed.filters).toHaveLength(1);
  });
});

describe("a date period", () => {
  test("resolves to the viewer's calendar days on a date field", () => {
    const now = new Date(2026, 2, 15, 9, 30);
    const literal = toLiteralQuery(
      DEF,
      {
        ...BASE,
        filters: [{ field: "due", op: "in_period", preset: "this-month" }],
      },
      now,
    );
    expect(literal.filters).toEqual([
      pair("due", "between", "2026-03-01", "2026-03-31"),
    ]);
    expect(validateQueryValues(DEF, literal)).toBeNull();
    expect(checkFilterOps(DEF, literal)).toBeNull();
  });
});

describe("a scope", () => {
  const scope: QueryScope = {
    filters: [
      list("folder_id", "any_of", [FOLDER]),
      none("deleted_at", "blank"),
    ],
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
    const own = list("starred", "any_of", ["true"]);
    const user: QueryState = { ...BASE, filters: [own] };
    await source.fetchPage(user, 10, signal);
    await source.fetchCount(user, false, signal);
    await source.fetchTotals(user, signal);
    await source.fetchGroups(user, signal);
    await source.fetchNarrowed(user, signal);
    expect(seen).toHaveLength(5);
    for (const query of seen) {
      expect(query.filters).toEqual([...(scope.filters ?? []), own]);
    }
    expect(user.filters).toEqual([own]);
    expect(listFilterChips(DEF, user).map((chip) => chip.id)).toEqual([
      "filter:starred:any_of",
      "sort",
    ]);
  });

  test("takes its fields and Match any out of what is offered", () => {
    const { capabilities } = withScope(createTestSource(CAPABILITIES), scope);
    expect(Object.keys(capabilities.filterOps)).not.toContain("folder_id");
    expect(Object.keys(capabilities.filterOps)).not.toContain("deleted_at");
    expect(capabilities.filterOps.starred).toEqual(["any_of"]);
    expect(capabilities.groupFields).toEqual(["starred"]);
    expect(capabilities.combineOr).toBe(false);
    expect(capabilities.canRun(BASE)).toBe(true);
    expect(
      capabilities.canRun(withFilters([list("folder_id", "any_of", [FOLDER])])),
    ).toBe(false);
    expect(capabilities.canRun({ ...BASE, combine: "or" })).toBe(false);
    const names = listQueryKeys(capabilities).map((key) => key.name);
    expect(names).not.toContain("f.folder_id.any_of");
    expect(names).toContain("f.starred.any_of");
  });

  test("decides what can run: the scoped query must have an index", () => {
    const { capabilities } = withScope(createTestSource(CAPABILITIES), scope);
    const starred = withFilters([list("starred", "any_of", ["true"])]);
    expect(capabilities.canRun(starred)).toBe(false);
    expect(
      capabilities.isNarrowed(withFilters([one("size", "greater_than", "1")])),
    ).toBe(true);
    expect(CAPABILITIES.canRun(starred)).toBe(true);
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

  test("filters a client grid's rows by any operator", async () => {
    const source = withScope(createMemorySource(DEF, ROWS), {
      filters: [
        none("deleted_at", "blank"),
        one("size", "greater_than", "5"),
        one("name", "starts_with", "inv"),
      ],
    });
    const signal = new AbortController().signal;
    const page = await source.fetchPage(BASE, 10, signal);
    expect(page.rows.map((row) => row.id)).toEqual(["b"]);
    expect((await source.fetchCount(BASE, false, signal)).count).toBe(1);
  });

  test("an empty scope is no wrapper at all", () => {
    const source = createTestSource(CAPABILITIES);
    expect(withScope(source, {})).toBe(source);
    expect(withScope(source, { filters: [] })).toBe(source);
    const filter = list("a", "any_of", ["b"]);
    expect(applyScope(BASE, { filters: [filter] }).filters).toEqual([filter]);
  });
});
