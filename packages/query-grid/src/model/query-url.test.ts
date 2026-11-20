import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { DATE_PRESETS } from "./date-presets.ts";
import {
  getField,
  type BaseFieldDef,
  type BaseGridDef,
  type SortState,
} from "./grid-def.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { createMemorySource } from "./memory-source.ts";
import { toLiteralQuery } from "./literal-filters.ts";
import {
  FILTER_OPS,
  getOperatorShape,
  listFixedValues,
  resolveFieldKind,
  type FilterOp,
} from "./operators.ts";
import { defaultQuery } from "./query-actions.ts";
import {
  FILTER_MAX,
  SORT_MAX,
  TEXT_MAX_LENGTH,
  withThenBy,
  type Filter,
  type QueryState,
} from "./query-state.ts";
import { normalizeQuery } from "./query-store.ts";
import { decodeQuery, encodeQuery, listQueryKeys } from "./query-url.ts";
import {
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  validateQueryValues,
} from "./query-validate.ts";

const DEF: BaseGridDef = {
  ...TEST_DEF,
  fields: [
    ...TEST_DEF.fields,
    {
      key: "kind",
      label: "Kind",
      type: "enum",
      nullable: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ],
    },
    { key: "flag", label: "Flag", type: "boolean" },
    { key: "ratio", label: "Ratio", type: "decimal" },
    { key: "day", label: "Day", type: "date" },
    { key: "tags", label: "Tags", type: "array" },
  ],
};
const CAPABILITIES = createMemorySource(DEF, []).capabilities;
const FC_RUNS = Number(process.env.FC_RUNS) || 0;
const PARAMS = FC_RUNS > 0 ? { numRuns: FC_RUNS } : {};
const TIMEOUT = FC_RUNS > 0 ? 600_000 : 5_000;
const SEPARATORS = ["..", "!", "(", ")", ",", ".", "&", "=", "+", "%", " "];
const KEY_NAMES = ["q", "sort", "match", "group", "cursor"];
const OLD_PREFIXES = ["f.", "o.", "r.", "c.", "nc.", "sw.", "ew.", "ne."];
const BLANK_TOKEN = "_empty";

const unit = fc.oneof(
  fc.constantFrom(...SEPARATORS),
  fc.string({ unit: "binary", minLength: 1, maxLength: 1 }),
);
const text = fc.string({ unit, maxLength: 12 });

const day = fc
  .date({
    min: new Date("1000-01-01T00:00:00Z"),
    max: new Date("9999-12-31T23:59:59Z"),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString());

function listBoundValues(field: BaseFieldDef): fc.Arbitrary<string> {
  switch (field.type) {
    case "decimal":
      return fc
        .tuple(fc.integer(), fc.option(fc.nat({ max: 999_999_999 })))
        .map(([whole, part]) =>
          part === null ? `${whole}` : `${whole}.${part}`,
        );
    case "date":
      return day.map((value) => value.slice(0, 10));
    case "datetime":
      return fc.oneof(
        day,
        day.map((value) => value.slice(0, 10)),
      );
    default:
      return fc.integer().map(String);
  }
}

const textValue = text.filter((value) => {
  const length = value.trim().length;
  return length > 0 && length <= TEXT_MAX_LENGTH;
});

function listOperandValues(field: BaseFieldDef): fc.Arbitrary<string> {
  return resolveFieldKind(field) === "text"
    ? textValue
    : listBoundValues(field);
}

function listChoiceValues(field: BaseFieldDef): fc.Arbitrary<string[]> {
  const fixed = listFixedValues(field);
  if (fixed) {
    return fc.subarray(fixed, { minLength: 1 });
  }
  if (field.type === "id") {
    return fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 3 });
  }
  return fc.uniqueArray(
    text.filter((value) => value.length > 0),
    { minLength: 1, maxLength: 4 },
  );
}

function listListValues(
  field: BaseFieldDef,
  op: FilterOp,
): fc.Arbitrary<(string | null)[]> {
  const values = listChoiceValues(field);
  if (field.nullable !== true || op === "all_of") {
    return values;
  }
  return fc
    .tuple(values, fc.boolean())
    .map(([picked, blank]): (string | null)[] =>
      blank ? [...picked, null] : picked,
    );
}

function listFilter(field: BaseFieldDef, op: FilterOp): fc.Arbitrary<Filter> {
  const { key } = field;
  switch (getOperatorShape(op)) {
    case "one":
      return listOperandValues(field).map(
        (value) => ({ field: key, op, value }) as Filter,
      );
    case "pair":
      return fc
        .tuple(listOperandValues(field), listOperandValues(field))
        .map(([min, max]) => ({ field: key, op, min, max }) as Filter);
    case "list":
      return listListValues(field, op).map(
        (values) => ({ field: key, op, values }) as Filter,
      );
    case "preset":
      return fc
        .constantFrom(...DATE_PRESETS)
        .map((preset) => ({ field: key, op: "in_period", preset }) as Filter);
    case "none":
      return fc.constant({ field: key, op } as Filter);
  }
}

const filterArbitraries = Object.entries(CAPABILITIES.filterOps).flatMap(
  ([key, ops]) => {
    const field = getField(DEF, key);
    return field ? ops.map((op) => listFilter(field, op)) : [];
  },
);

// The URL holds one key per field and operator, so a list or a valueless filter appears once per field and operator.
function filterIdentity(filter: Filter): string {
  const shape = getOperatorShape(filter.op);
  return shape === "list" || shape === "none"
    ? `${filter.field}:${filter.op}`
    : JSON.stringify(filter);
}

const arbitrarySorts: fc.Arbitrary<SortState[]> = fc.uniqueArray(
  fc.record({
    field: fc.constantFrom(...CAPABILITIES.sortFields),
    direction: fc.constantFrom("asc" as const, "desc" as const),
  }),
  {
    minLength: 1,
    maxLength: SORT_MAX,
    selector: (sort) => sort.field,
  },
);

const searchValue = fc
  .string({ unit, minLength: SEARCH_MIN_LENGTH, maxLength: SEARCH_MAX_LENGTH })
  .filter((value) => {
    const length = value.trim().length;
    return length >= SEARCH_MIN_LENGTH && length <= SEARCH_MAX_LENGTH;
  });

function isUsable(query: QueryState): boolean {
  return normalizeQuery(DEF, CAPABILITIES, query) === query;
}

const arbitraryQuery: fc.Arbitrary<QueryState> = fc
  .record({
    filters: fc.uniqueArray(fc.oneof(...filterArbitraries), {
      maxLength: FILTER_MAX,
      selector: filterIdentity,
    }),
    combine: fc.constantFrom("and" as const, "or" as const),
    search: fc.option(searchValue),
    sorts: arbitrarySorts,
    group: fc.option(fc.constantFrom(...CAPABILITIES.groupFields)),
    cursor: fc.option(text),
  })
  .map(({ sorts: [sort, ...thenBy], ...rest }) =>
    withThenBy({ ...rest, sort }, thenBy),
  )
  .filter(isUsable);

const fieldKey = fc.oneof(
  fc.constantFrom(...DEF.fields.map((field) => field.key)),
  text,
);

const arbitraryName = fc.oneof(
  fc
    .tuple(fieldKey, fc.oneof(fc.constantFrom(...FILTER_OPS), text))
    .map(([key, op]) => `f.${key}.${op}`),
  fc
    .tuple(fc.constantFrom(...OLD_PREFIXES), fieldKey)
    .map(([prefix, key]) => `${prefix}${key}`),
  fc.constantFrom(...KEY_NAMES),
  text,
);

const arbitraryValue = fc.oneof(
  fc.constantFrom(
    "",
    "any",
    "all",
    BLANK_TOKEN,
    "_not_empty",
    "!open",
    "open",
    "true",
    "..",
    "!..",
    "(..)",
    "!(1..2)",
    "1..2",
    "1..2..3",
    "2024-02-30..2024-03-01",
    "total.asc,created_at.desc",
    "name.asc,name.desc",
    ",,",
    ".asc",
    ...DATE_PRESETS,
  ),
  fc
    .array(fc.oneof(fc.constantFrom(...SEPARATORS), fc.integer().map(String)), {
      maxLength: 6,
    })
    .map((parts) => parts.join("")),
  text,
  fc.string({ unit: "binary", maxLength: 20 }),
);

const arbitraryPair = fc.tuple(arbitraryName, arbitraryValue);

const arbitraryMixedPairs = fc
  .tuple(
    arbitraryQuery.map((query) => [...encodeQuery(DEF, query)]),
    fc.array(arbitraryPair, { maxLength: 3 }),
  )
  .chain(([valid, junk]) => {
    const pairs = [...valid, ...junk, ...valid.slice(0, 2)];
    return fc.shuffledSubarray(pairs, { minLength: pairs.length });
  });

const arbitraryParams: fc.Arbitrary<URLSearchParams> = fc
  .oneof(fc.array(arbitraryPair, { maxLength: 16 }), arbitraryMixedPairs)
  .map((pairs) => new URLSearchParams(pairs));

function toUrl(query: QueryState): string {
  return encodeQuery(DEF, query).toString();
}

function fromUrl(url: string): QueryState {
  return decodeQuery(DEF, new URLSearchParams(url));
}

function expectValid(query: QueryState): void {
  expect(validateQueryValues(DEF, toLiteralQuery(DEF, query, null))).toBeNull();
  expect(normalizeQuery(DEF, CAPABILITIES, query)).toBe(query);
}

describe("query url examples", () => {
  test("an empty cursor survives the round trip", () => {
    const query: QueryState = { ...defaultQuery(DEF), cursor: "" };
    expectValid(query);
    expect(fromUrl(toUrl(query))).toEqual(query);
  });

  test("or blank is a token in the list, and a valueless operator has an empty value", () => {
    const query: QueryState = {
      ...defaultQuery(DEF),
      filters: [
        { field: "kind", op: "any_of", values: ["a", null] },
        { field: "note", op: "blank" },
      ],
    };
    expectValid(query);
    expect(toUrl(query)).toBe(
      "f.kind.any_of=a&f.kind.any_of=_empty&f.note.blank=",
    );
    expect(fromUrl(toUrl(query))).toEqual(query);
  });

  test("the keys of the old bucket model are ignored", () => {
    const old = [
      "f.status=open",
      "f.status=!open",
      "f.note=_not_empty",
      "r.total=5..9",
      "r.created_at=last-7-days",
      "c.name=acme",
      "nc.name=acme",
      "sw.name=ac",
      "ew.name=me",
      "ne.name=acme",
      "o.tags=a",
    ].join("&");
    expect(fromUrl(old)).toEqual(defaultQuery(DEF));
  });
});

describe("query url properties", () => {
  test(
    "a valid query survives the round trip",
    () => {
      fc.assert(
        fc.property(arbitraryQuery, (query) => {
          expectValid(query);
          expect(fromUrl(toUrl(query))).toEqual(query);
        }),
        PARAMS,
      );
    },
    TIMEOUT,
  );

  test(
    "two valid queries are equal exactly when their urls are",
    () => {
      const pair = arbitraryQuery.chain((first) =>
        fc.tuple(
          fc.constant(first),
          fc.oneof(
            arbitraryQuery,
            fc.constant(structuredClone(first)),
            fc.constant(fromUrl(toUrl(first))),
          ),
        ),
      );
      fc.assert(
        fc.property(pair, ([first, second]) => {
          expectValid(second);
          expect(toUrl(first)).toBe(toUrl(first));
          expect(toUrl(first) === toUrl(second)).toBe(
            Bun.deepEquals(first, second),
          );
        }),
        PARAMS,
      );
    },
    TIMEOUT,
  );

  test(
    "a valid query writes only the keys its capabilities list",
    () => {
      const names = new Set(listQueryKeys(CAPABILITIES).map((key) => key.name));
      fc.assert(
        fc.property(arbitraryQuery, (query) => {
          for (const name of encodeQuery(DEF, query).keys()) {
            expect(names.has(name)).toBe(true);
          }
        }),
        PARAMS,
      );
    },
    TIMEOUT,
  );

  test(
    "decoding any params never throws",
    () => {
      fc.assert(
        fc.property(arbitraryParams, (params) => {
          normalizeQuery(DEF, CAPABILITIES, decodeQuery(DEF, params));
        }),
        PARAMS,
      );
    },
    TIMEOUT,
  );

  test(
    "a normalized url reads back as itself",
    () => {
      fc.assert(
        fc.property(arbitraryParams, (params) => {
          const once = toUrl(
            normalizeQuery(DEF, CAPABILITIES, decodeQuery(DEF, params)),
          );
          const twice = toUrl(normalizeQuery(DEF, CAPABILITIES, fromUrl(once)));
          expect(twice).toBe(once);
        }),
        PARAMS,
      );
    },
    TIMEOUT,
  );
});
