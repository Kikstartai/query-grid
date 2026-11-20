import {
  getField,
  KEY_FIELD,
  type BaseFieldDef,
  type IndexDef,
  type IndexedGridDef,
  type SortIndexDef,
} from "./grid-def.ts";
import { indexId, isOverlapField, isTextField } from "./indexes.ts";
import type { Problem, ProblemParams } from "./problems.ts";
import { SORT_MAX } from "./query-state.ts";

export const INDEX_RULE_CODES = [
  "index_unknown_field",
  "index_duplicate",
  "index_nullable_sort",
  "index_no_sort",
  "index_sort_is_filter",
  "index_array_sort",
  "index_array_filter",
  "index_sort_repeats",
  "index_order_too_long",
  "index_not_text",
  "index_not_array",
] as const;

export type IndexRuleCode = (typeof INDEX_RULE_CODES)[number];

export interface IndexProblem extends Problem {
  code: IndexRuleCode;
}

type FieldTest = (field: BaseFieldDef) => boolean;

interface Check {
  def: IndexedGridDef;
  problems: IndexProblem[];
}

function report(
  check: Check,
  code: IndexRuleCode,
  params: ProblemParams,
): void {
  check.problems.push({ code, params });
}

function getKnownField(
  check: Check,
  key: string,
  path: string,
): BaseFieldDef | null {
  const field = getField(check.def, key);
  if (!field) {
    report(check, "index_unknown_field", { path, field: key });
  }
  return field;
}

function reportRepeats(check: Check, keys: string[], path: string): void {
  for (const [at, key] of keys.entries()) {
    if (keys.indexOf(key) !== at) {
      report(check, "index_duplicate", { path: `${path}.${at}`, value: key });
    }
  }
}

function checkSortColumns(
  check: Check,
  index: SortIndexDef,
  path: string,
): void {
  if (index.sort.length === 0) {
    report(check, "index_no_sort", { path: `${path}.sort` });
  }
  for (const [at, key] of index.sort.entries()) {
    const params = { path: `${path}.sort.${at}`, field: key };
    const field = getKnownField(check, key, params.path);
    if (!field) {
      continue;
    }
    if (field.nullable) {
      report(check, "index_nullable_sort", params);
    }
    if (isOverlapField(field)) {
      report(check, "index_array_sort", params);
    }
    if (index.filter.includes(key)) {
      report(check, "index_sort_is_filter", params);
    }
    if (at > 0 && key === KEY_FIELD) {
      report(check, "index_sort_repeats", params);
    }
  }
  reportRepeats(check, index.sort, `${path}.sort`);
  if (index.sort.length > SORT_MAX) {
    report(check, "index_order_too_long", {
      path: `${path}.sort`,
      max: SORT_MAX,
    });
  }
}

function checkFilterColumns(
  check: Check,
  index: SortIndexDef,
  path: string,
): void {
  for (const [at, key] of index.filter.entries()) {
    const columnPath = `${path}.filter.${at}`;
    const field = getKnownField(check, key, columnPath);
    if (field && isOverlapField(field)) {
      report(check, "index_array_filter", { path: columnPath, field: key });
    }
  }
  reportRepeats(check, index.filter, `${path}.filter`);
}

function checkOwnIndex(
  check: Check,
  key: string,
  path: string,
  fits: FieldTest,
  code: IndexRuleCode,
): void {
  const field = getKnownField(check, key, path);
  if (field && !fits(field)) {
    report(check, code, { path, field: key });
  }
}

function checkIndex(check: Check, index: IndexDef, path: string): void {
  if ("text" in index) {
    checkOwnIndex(
      check,
      index.text,
      `${path}.text`,
      isTextField,
      "index_not_text",
    );
    return;
  }
  if ("array" in index) {
    checkOwnIndex(
      check,
      index.array,
      `${path}.array`,
      isOverlapField,
      "index_not_array",
    );
    return;
  }
  checkSortColumns(check, index, path);
  checkFilterColumns(check, index, path);
}

export function listIndexProblems(def: IndexedGridDef): IndexProblem[] {
  const check: Check = { def, problems: [] };
  const seen = new Set<string>();
  for (const [at, index] of def.indexes.entries()) {
    const path = `indexes.${at}`;
    const id = indexId(index);
    if (seen.has(id)) {
      report(check, "index_duplicate", { path, value: id });
    }
    seen.add(id);
    checkIndex(check, index, path);
  }
  return check.problems;
}
