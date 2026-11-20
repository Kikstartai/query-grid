import {
  getField,
  isRangeType,
  KEY_FIELD,
  type BaseFieldDef,
  type IndexDef,
  type IndexedGridDef,
} from "./grid-def.ts";
import { indexId, isOverlapField, isTextField } from "./indexes.ts";
import type { Problem, ProblemParams } from "./problems.ts";
import { SORT_MAX } from "./query-state.ts";

export const INDEX_RULE_CODES = [
  "index_unknown_field",
  "index_duplicate",
  "index_nullable_sort",
  "index_no_range",
  "index_sort_is_equality",
  "index_array_sort",
  "index_array_equality",
  "index_then_repeats",
  "index_order_too_long",
  "index_never_blank",
  "index_blank_is_filtered",
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

function checkSort(check: Check, index: IndexDef, path: string): boolean {
  const at = `${path}.sort`;
  const sort = getKnownField(check, index.sort, at);
  if (!sort) {
    return false;
  }
  const params = { path: at, field: index.sort };
  if (sort.nullable) {
    report(check, "index_nullable_sort", params);
  }
  if (index.range && !isRangeType(sort.type)) {
    report(check, "index_no_range", {
      path: `${path}.range`,
      field: index.sort,
      type: sort.type,
    });
  }
  if (index.equals.includes(index.sort)) {
    report(check, "index_sort_is_equality", params);
  }
  if (isOverlapField(sort)) {
    report(check, "index_array_sort", params);
  }
  return true;
}

function checkEquals(check: Check, index: IndexDef, path: string): void {
  for (const [at, key] of index.equals.entries()) {
    const field = getKnownField(check, key, `${path}.equals.${at}`);
    if (field && isOverlapField(field)) {
      report(check, "index_array_equality", {
        path: `${path}.equals.${at}`,
        field: key,
      });
    }
  }
}

function checkThen(check: Check, index: IndexDef, path: string): void {
  const then = index.then ?? [];
  for (const [at, key] of then.entries()) {
    const params = { path: `${path}.then.${at}`, field: key };
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
    if (index.equals.includes(key) || key === index.sort || key === KEY_FIELD) {
      report(check, "index_then_repeats", params);
    }
  }
  reportRepeats(check, then, `${path}.then`);
  if (then.length + 1 > SORT_MAX) {
    report(check, "index_order_too_long", {
      path: `${path}.then`,
      max: SORT_MAX,
    });
  }
}

function checkBlank(check: Check, index: IndexDef, path: string): void {
  for (const [at, key] of (index.blank ?? []).entries()) {
    const params = { path: `${path}.blank.${at}`, field: key };
    const field = getKnownField(check, key, params.path);
    if (!field) {
      continue;
    }
    if (!field.nullable) {
      report(check, "index_never_blank", params);
    }
    if (index.equals.includes(key) || key === index.sort) {
      report(check, "index_blank_is_filtered", params);
    }
  }
}

function checkIndex(check: Check, index: IndexDef, path: string): void {
  if (!checkSort(check, index, path)) {
    return;
  }
  checkEquals(check, index, path);
  checkThen(check, index, path);
  checkBlank(check, index, path);
}

function checkOwnIndexes(
  check: Check,
  keys: string[],
  path: string,
  fits: FieldTest,
  code: IndexRuleCode,
): void {
  for (const [at, key] of keys.entries()) {
    const field = getKnownField(check, key, `${path}.${at}`);
    if (field && !fits(field)) {
      report(check, code, { path: `${path}.${at}`, field: key });
    }
  }
  reportRepeats(check, keys, path);
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
  checkOwnIndexes(
    check,
    def.textIndexes ?? [],
    "textIndexes",
    isTextField,
    "index_not_text",
  );
  checkOwnIndexes(
    check,
    def.arrayIndexes ?? [],
    "arrayIndexes",
    isOverlapField,
    "index_not_array",
  );
  return check.problems;
}
