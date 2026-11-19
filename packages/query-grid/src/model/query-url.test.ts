import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { DATE_PRESETS } from "./date-presets.ts";
import { EMPTY_VALUE, NOT_EMPTY_VALUE } from "./field-values.ts";
import {
  getField,
  isDateType,
  type BaseFieldDef,
  type BaseGridDef,
  type SortState,
} from "./grid-def.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import { memoryCapabilities } from "./memory-source.ts";
import { toLiteralQuery } from "./literal-filters.ts";
import { defaultQuery } from "./query-actions.ts";
import { toRange } from "./range-bounds.ts";
import {
  RANGE_FILTER_MAX,
  SORT_MAX,
  TEXT_FILTER_MAX,
  TEXT_MAX_LENGTH,
  TEXT_OPS,
  withThenBy,
  type QueryState,
  type RangeState,
  type TextState,
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
const CAPABILITIES = memoryCapabilities(DEF);
const FC_RUNS = Number(process.env.FC_RUNS) || 0;
const PARAMS = FC_RUNS > 0 ? { numRuns: FC_RUNS } : {};
const TIMEOUT = FC_RUNS > 0 ? 600_000 : 5_000;
const SEPARATORS = ["..", "!", "(", ")", ",", ".", "&", "=", "+", "%", " "];
const KEY_NAMES = ["q", "sort", "match", "group", "cursor"];
const PREFIXES = ["f.", "o.", "r.", "c.", "nc.", "sw.", "ew.", "ne."];

function listFields(keys: string[]): BaseFieldDef[] {
  return keys.flatMap((key) => getField(DEF, key) ?? []);
}

function sometimes<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<T | null> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constant(null) },
    { weight: 1, arbitrary },
  );
}

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

function listEqualsValues(field: BaseFieldDef): fc.Arbitrary<string[]> {
  const reserved = field.nullable
    ? [
        fc.constant<string[]>([NOT_EMPTY_VALUE]),
        fc.constant<string[]>([EMPTY_VALUE]),
      ]
    : [];
  if (field.options) {
    const values = field.options.map((option) => option.value);
    const picked = fc.subarray(values, { minLength: 1 });
    return fc.oneof(
      picked,
      picked.map((items) => items.map((value) => `!${value}`)),
      ...reserved,
    );
  }
  if (field.type === "boolean") {
    return fc.subarray(["true", "false"], { minLength: 1 });
  }
  if (field.type === "id") {
    return fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 3 });
  }
  const values = fc.uniqueArray(
    text.filter((value) => value.length > 0),
    { minLength: 1, maxLength: 4 },
  );
  return fc.oneof(values, ...reserved);
}

function toRecord(
  entries: [string, string[] | null][],
): Record<string, string[]> {
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string[]] => entry[1] !== null),
  );
}

function listRecord(
  keys: string[],
  values: (field: BaseFieldDef) => fc.Arbitrary<string[]>,
): fc.Arbitrary<Record<string, string[]>> {
  return fc
    .tuple(
      ...listFields(keys).map((field) =>
        sometimes(values(field)).map((picked): [string, string[] | null] => [
          field.key,
          picked,
        ]),
      ),
    )
    .map(toRecord);
}

function listRange(field: BaseFieldDef): fc.Arbitrary<RangeState> {
  const bound = fc.option(listBoundValues(field));
  const bounded = fc
    .record({
      min: bound,
      max: bound,
      exclude: fc.boolean(),
      minExclusive: fc.boolean(),
      maxExclusive: fc.boolean(),
    })
    .map((input) =>
      toRange(field.key, {
        ...input,
        exclude: input.exclude && (input.min !== null || input.max !== null),
      }),
    );
  if (!isDateType(field.type)) {
    return bounded;
  }
  return fc.oneof(
    bounded,
    fc
      .constantFrom(...DATE_PRESETS)
      .map((preset) => toRange(field.key, { min: null, max: null, preset })),
  );
}

const textValue = text.filter((value) => {
  const length = value.trim().length;
  return length > 0 && length <= TEXT_MAX_LENGTH;
});

const arbitraryText: fc.Arbitrary<TextState> = fc.record({
  field: fc.constantFrom(...CAPABILITIES.textFields),
  op: fc.constantFrom(...TEXT_OPS),
  value: textValue,
});

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
    equals: listRecord(CAPABILITIES.equalsFields, listEqualsValues),
    overlaps: listRecord(CAPABILITIES.overlapFields, () =>
      fc.uniqueArray(
        text.filter((value) => value.length > 0),
        { minLength: 1, maxLength: 4 },
      ),
    ),
    ranges: fc.uniqueArray(
      fc.oneof(...listFields(CAPABILITIES.rangeFields).map(listRange)),
      {
        maxLength: RANGE_FILTER_MAX,
        selector: (range) => JSON.stringify(range),
      },
    ),
    texts: fc.uniqueArray(arbitraryText, {
      maxLength: TEXT_FILTER_MAX,
      selector: (item) => JSON.stringify(item),
    }),
    match: fc.constantFrom("all" as const, "any" as const),
    search: fc.option(searchValue),
    sorts: arbitrarySorts,
    group: fc.option(fc.constantFrom(...CAPABILITIES.groupFields)),
    cursor: fc.option(text),
  })
  .map(({ sorts: [sort, ...thenBy], ...rest }) =>
    withThenBy({ ...rest, sort }, thenBy),
  )
  .filter(isUsable);

const arbitraryName = fc.oneof(
  fc
    .tuple(
      fc.constantFrom(...PREFIXES),
      fc.oneof(fc.constantFrom(...DEF.fields.map((field) => field.key)), text),
    )
    .map(([prefix, key]) => `${prefix}${key}`),
  fc.constantFrom(...KEY_NAMES),
  text,
);

const arbitraryValue = fc.oneof(
  fc.constantFrom(
    "",
    "any",
    "all",
    EMPTY_VALUE,
    NOT_EMPTY_VALUE,
    "!open",
    "open",
    "true",
    "..",
    "!..",
    "(..)",
    "!(1..2)",
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
