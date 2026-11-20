import { isCurrencyCode } from "./format.ts";
import {
  FIELD_RENDERS,
  FIELD_TONES,
  FIELD_TYPES,
  KEY_FIELD,
  type BaseFieldDef,
  type FacetDef,
  type FieldLookup,
  type FieldOption,
  type FieldTone,
  type FieldType,
  type IndexDef,
  type IndexedGridDef,
  type SortDirection,
  type SortState,
} from "./grid-def.ts";
import { listIndexProblems } from "./index-rules.ts";
import type { Problem, ProblemParams } from "./problems.ts";
import { SORT_MAX } from "./query-state.ts";

export type StoredDefResult =
  | { ok: true; def: IndexedGridDef }
  | { ok: false; problems: Problem[] };

type Source = Record<string, unknown>;
type FieldTest = (field: BaseFieldDef) => boolean;
type FieldExtras = Omit<BaseFieldDef, "key" | "label" | "type">;
type IndexExtrasDef = Omit<IndexDef, "equals" | "sort">;
type DefExtras = Omit<
  IndexedGridDef,
  "id" | "fields" | "defaultSort" | "indexes"
>;

export interface StoredDefOptions {
  fields?: string[];
}

interface Run {
  problems: Problem[];
  allowed: string[] | null;
  declared: boolean;
  keys: Set<string>;
  fields: Map<string, BaseFieldDef>;
}

interface RefRule {
  max: number;
  unique: boolean;
  accepts?: FieldTest;
}

interface ParsedField {
  path: string;
  field: BaseFieldDef;
}

const PROBLEM_MAX = 50;
const ROOT_PATH = "";
const ID_MAX = 100;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const KEY_MAX = 63;
const KEY_PATTERN = /^[a-z_][a-z0-9_]*$/;
const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];
const TEXT_MAX = 200;
const FIELDS_MAX = 200;
const OPTIONS_MAX = 500;
const TONES_MAX = 500;
const INDEXES_MAX = 100;
const MAX_VALUES_MIN = 1;
const MAX_VALUES_MAX = 100;
const WIDTH_MIN = 20;
const WIDTH_MAX = 2000;

const SORT_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];
const FIELD_FLAGS = [
  "nullable",
  "grouping",
  "pinned",
  "hidden",
  "wrap",
] as const;
const INDEX_FLAGS = ["range", "multi"] as const;

const ROOT_KEYS = [
  "id",
  "fields",
  "defaultSort",
  "facet",
  "totals",
  "search",
  "orderField",
  "indexes",
  "textIndexes",
  "arrayIndexes",
];
const FIELD_KEYS = [
  "key",
  "label",
  "type",
  "nullable",
  "options",
  "lookup",
  "maxValues",
  "currency",
  "grouping",
  "width",
  "pinned",
  "hidden",
  "wrap",
  "render",
  "tones",
];
const OPTION_KEYS = ["value", "label"];
const LOOKUP_KEYS = ["labelField"];
const SORT_KEYS = ["field", "direction"];
const FACET_KEYS = ["field"];
const INDEX_KEYS = ["equals", "sort", "range", "multi", "blank", "then"];

const TOTALS_RULE: RefRule = { max: 20, unique: true, accepts: isSummable };
const SEARCH_RULE: RefRule = { max: 20, unique: true };
const INDEX_COLUMNS_RULE: RefRule = { max: FIELDS_MAX, unique: false };
const THEN_RULE: RefRule = { max: SORT_MAX - 1, unique: true };
const OWN_INDEXES_RULE: RefRule = { max: 50, unique: true };

function isSummable(field: BaseFieldDef): boolean {
  return (
    (field.type === "money" || field.type === "integer") && !field.nullable
  );
}

function isOrderable(field: BaseFieldDef): boolean {
  return (
    (field.type === "integer" || field.type === "decimal") && !field.nullable
  );
}

function hasOptions(field: BaseFieldDef): boolean {
  return field.options !== undefined;
}

function report(run: Run, code: string, params: ProblemParams): void {
  if (run.problems.length < PROBLEM_MAX) {
    run.problems.push({ code, params });
  }
}

function invalid(run: Run, path: string): null {
  report(run, "stored_invalid", { path });
  return null;
}

function joinPath(path: string, key: string | number): string {
  return path === ROOT_PATH ? String(key) : `${path}.${key}`;
}

function isPlainObject(value: unknown): value is Source {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pick(source: Source, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

function readObject(
  value: unknown,
  path: string,
  keys: readonly string[],
  run: Run,
): Source | null {
  if (!isPlainObject(value)) {
    return invalid(run, path);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      report(run, "stored_unknown_key", { path: joinPath(path, key) });
    }
  }
  return value;
}

function readList(
  value: unknown,
  path: string,
  max: number,
  run: Run,
): unknown[] | null {
  if (!Array.isArray(value)) {
    return invalid(run, path);
  }
  if (value.length > max) {
    report(run, "stored_too_many", { path, max });
    return null;
  }
  return Array.from<unknown>(value);
}

function readString(
  value: unknown,
  path: string,
  max: number,
  run: Run,
  pattern?: RegExp,
): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    return invalid(run, path);
  }
  if (pattern && !pattern.test(value)) {
    return invalid(run, path);
  }
  return value;
}

function readBoolean(value: unknown, path: string, run: Run): boolean | null {
  return typeof value === "boolean" ? value : invalid(run, path);
}

function readNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
  run: Run,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid(run, path);
  }
  return value < min || value > max ? invalid(run, path) : value;
}

function readInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
  run: Run,
): number | null {
  return Number.isInteger(value)
    ? readNumber(value, path, min, max, run)
    : invalid(run, path);
}

function readOneOf<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  run: Run,
): T | null {
  return allowed.find((item) => item === value) ?? invalid(run, path);
}

function readOptional<T, K extends keyof T & string>(
  target: T,
  key: K,
  source: Source,
  path: string,
  read: (value: unknown, path: string) => NonNullable<T[K]> | null,
): void {
  const value = pick(source, key);
  if (value === undefined) {
    return;
  }
  const result = read(value, joinPath(path, key));
  if (result !== null) {
    target[key] = result;
  }
}

function readFieldRef(
  value: unknown,
  path: string,
  run: Run,
  accepts?: FieldTest,
): string | null {
  if (typeof value !== "string") {
    return invalid(run, path);
  }
  if (run.declared && !run.keys.has(value)) {
    report(run, "stored_unknown_field", { path, field: value });
    return null;
  }
  const field = run.fields.get(value);
  if (accepts && field && !accepts(field)) {
    return invalid(run, path);
  }
  return value;
}

function readFieldRefs(
  value: unknown,
  path: string,
  rule: RefRule,
  run: Run,
): string[] | null {
  const list = readList(value, path, rule.max, run);
  if (list === null) {
    return null;
  }
  const refs: string[] = [];
  for (const [index, item] of list.entries()) {
    const at = joinPath(path, index);
    const ref = readFieldRef(item, at, run, rule.accepts);
    if (ref === null) {
      continue;
    }
    if (rule.unique && refs.includes(ref)) {
      report(run, "stored_duplicate", { path: at, value: ref });
      continue;
    }
    refs.push(ref);
  }
  return refs;
}

function readOption(
  value: unknown,
  path: string,
  run: Run,
): FieldOption | null {
  const source = readObject(value, path, OPTION_KEYS, run);
  if (source === null) {
    return null;
  }
  const optionValue = readString(
    pick(source, "value"),
    joinPath(path, "value"),
    TEXT_MAX,
    run,
  );
  const label = readString(
    pick(source, "label"),
    joinPath(path, "label"),
    TEXT_MAX,
    run,
  );
  if (optionValue === null || label === null) {
    return null;
  }
  return { value: optionValue, label };
}

function readOptions(
  value: unknown,
  path: string,
  run: Run,
): FieldOption[] | null {
  const list = readList(value, path, OPTIONS_MAX, run);
  if (list === null) {
    return null;
  }
  const seen = new Set<string>();
  const options: FieldOption[] = [];
  for (const [index, item] of list.entries()) {
    const at = joinPath(path, index);
    const option = readOption(item, at, run);
    if (option === null) {
      continue;
    }
    if (seen.has(option.value)) {
      report(run, "stored_duplicate", {
        path: joinPath(at, "value"),
        value: option.value,
      });
      continue;
    }
    seen.add(option.value);
    options.push(option);
  }
  return options;
}

function readLookup(
  value: unknown,
  path: string,
  run: Run,
): FieldLookup | null {
  const source = readObject(value, path, LOOKUP_KEYS, run);
  if (source === null) {
    return null;
  }
  const labelField = readString(
    pick(source, "labelField"),
    joinPath(path, "labelField"),
    KEY_MAX,
    run,
  );
  return labelField === null ? null : { labelField };
}

function readCurrency(
  value: unknown,
  path: string,
  type: FieldType | null,
  run: Run,
): string | null {
  if (typeof value !== "string" || (type !== null && type !== "money")) {
    return invalid(run, path);
  }
  return isCurrencyCode(value) ? value : invalid(run, path);
}

function readTones(
  value: unknown,
  path: string,
  run: Run,
): Record<string, FieldTone> | null {
  if (!isPlainObject(value)) {
    return invalid(run, path);
  }
  const keys = Object.keys(value);
  if (keys.length > TONES_MAX) {
    report(run, "stored_too_many", { path, max: TONES_MAX });
    return null;
  }
  const entries: [string, FieldTone][] = [];
  for (const key of keys) {
    const at = joinPath(path, key);
    if (UNSAFE_KEYS.includes(key)) {
      invalid(run, at);
      continue;
    }
    const tone = readOneOf(value[key], at, FIELD_TONES, run);
    if (tone !== null) {
      entries.push([key, tone]);
    }
  }
  return Object.fromEntries(entries);
}

function readFieldKey(value: unknown, path: string, run: Run): string | null {
  const key = readString(value, path, KEY_MAX, run, KEY_PATTERN);
  if (key === null) {
    return null;
  }
  if (UNSAFE_KEYS.includes(key)) {
    return invalid(run, path);
  }
  if (run.allowed && !run.allowed.includes(key)) {
    report(run, "stored_unknown_field", { path, field: key });
    return null;
  }
  if (run.keys.has(key)) {
    report(run, "stored_duplicate", { path, value: key });
    return null;
  }
  run.keys.add(key);
  return key;
}

function readFieldExtras(
  source: Source,
  path: string,
  type: FieldType | null,
  run: Run,
): FieldExtras {
  const extras: FieldExtras = {};
  for (const flag of FIELD_FLAGS) {
    readOptional(extras, flag, source, path, (value, at) =>
      readBoolean(value, at, run),
    );
  }
  readOptional(extras, "options", source, path, (value, at) =>
    readOptions(value, at, run),
  );
  readOptional(extras, "lookup", source, path, (value, at) =>
    readLookup(value, at, run),
  );
  readOptional(extras, "maxValues", source, path, (value, at) =>
    readInteger(value, at, MAX_VALUES_MIN, MAX_VALUES_MAX, run),
  );
  readOptional(extras, "currency", source, path, (value, at) =>
    readCurrency(value, at, type, run),
  );
  readOptional(extras, "width", source, path, (value, at) =>
    readNumber(value, at, WIDTH_MIN, WIDTH_MAX, run),
  );
  readOptional(extras, "render", source, path, (value, at) =>
    readOneOf(value, at, FIELD_RENDERS, run),
  );
  readOptional(extras, "tones", source, path, (value, at) =>
    readTones(value, at, run),
  );
  if (type === "enum" && pick(source, "options") === undefined) {
    invalid(run, joinPath(path, "options"));
  }
  return extras;
}

function readField(
  value: unknown,
  path: string,
  run: Run,
): BaseFieldDef | null {
  const source = readObject(value, path, FIELD_KEYS, run);
  if (source === null) {
    return null;
  }
  const key = readFieldKey(pick(source, "key"), joinPath(path, "key"), run);
  const label = readString(
    pick(source, "label"),
    joinPath(path, "label"),
    TEXT_MAX,
    run,
  );
  const type = readOneOf(
    pick(source, "type"),
    joinPath(path, "type"),
    FIELD_TYPES,
    run,
  );
  const extras = readFieldExtras(source, path, type, run);
  if (key === null || label === null || type === null) {
    return null;
  }
  return { key, label, type, ...extras };
}

function reportUnknownLookups(parsed: ParsedField[], run: Run): void {
  for (const { path, field } of parsed) {
    if (field.lookup && !run.keys.has(field.lookup.labelField)) {
      report(run, "stored_unknown_field", {
        path: joinPath(joinPath(path, "lookup"), "labelField"),
        field: field.lookup.labelField,
      });
    }
  }
}

function readFields(value: unknown, run: Run): BaseFieldDef[] | null {
  const path = "fields";
  const list = readList(value, path, FIELDS_MAX, run);
  if (list === null) {
    return null;
  }
  if (list.length === 0) {
    return invalid(run, path);
  }
  run.declared = true;
  const parsed: ParsedField[] = [];
  for (const [index, item] of list.entries()) {
    const at = joinPath(path, index);
    const field = readField(item, at, run);
    if (field !== null) {
      run.fields.set(field.key, field);
      parsed.push({ path: at, field });
    }
  }
  reportUnknownLookups(parsed, run);
  if (!run.keys.has(KEY_FIELD)) {
    report(run, "stored_unknown_field", { path, field: KEY_FIELD });
  }
  return parsed.map((entry) => entry.field);
}

function readSort(value: unknown, path: string, run: Run): SortState | null {
  const source = readObject(value, path, SORT_KEYS, run);
  if (source === null) {
    return null;
  }
  const field = readFieldRef(
    pick(source, "field"),
    joinPath(path, "field"),
    run,
  );
  const direction = readOneOf(
    pick(source, "direction"),
    joinPath(path, "direction"),
    SORT_DIRECTIONS,
    run,
  );
  if (field === null || direction === null) {
    return null;
  }
  return { field, direction };
}

function readFacet(value: unknown, path: string, run: Run): FacetDef | null {
  const source = readObject(value, path, FACET_KEYS, run);
  if (source === null) {
    return null;
  }
  const field = readFieldRef(
    pick(source, "field"),
    joinPath(path, "field"),
    run,
    hasOptions,
  );
  return field === null ? null : { field };
}

function readIndex(value: unknown, path: string, run: Run): IndexDef | null {
  const source = readObject(value, path, INDEX_KEYS, run);
  if (source === null) {
    return null;
  }
  const equals = readFieldRefs(
    pick(source, "equals"),
    joinPath(path, "equals"),
    INDEX_COLUMNS_RULE,
    run,
  );
  const sort = readFieldRef(pick(source, "sort"), joinPath(path, "sort"), run);
  const extras: IndexExtrasDef = {};
  for (const flag of INDEX_FLAGS) {
    readOptional(extras, flag, source, path, (item, at) =>
      readBoolean(item, at, run),
    );
  }
  readOptional(extras, "blank", source, path, (item, at) =>
    readFieldRefs(item, at, INDEX_COLUMNS_RULE, run),
  );
  readOptional(extras, "then", source, path, (item, at) =>
    readFieldRefs(item, at, THEN_RULE, run),
  );
  if (equals === null || sort === null) {
    return null;
  }
  return { equals, sort, ...extras };
}

function readIndexes(value: unknown, run: Run): IndexDef[] | null {
  if (value === undefined) {
    return [];
  }
  const path = "indexes";
  const list = readList(value, path, INDEXES_MAX, run);
  if (list === null) {
    return null;
  }
  return list.flatMap(
    (item, index) => readIndex(item, joinPath(path, index), run) ?? [],
  );
}

function readDefExtras(source: Source, run: Run): DefExtras {
  const extras: DefExtras = {};
  readOptional(extras, "facet", source, ROOT_PATH, (value, at) =>
    readFacet(value, at, run),
  );
  readOptional(extras, "totals", source, ROOT_PATH, (value, at) =>
    readFieldRefs(value, at, TOTALS_RULE, run),
  );
  readOptional(extras, "search", source, ROOT_PATH, (value, at) =>
    readFieldRefs(value, at, SEARCH_RULE, run),
  );
  readOptional(extras, "orderField", source, ROOT_PATH, (value, at) =>
    readFieldRef(value, at, run, isOrderable),
  );
  for (const key of ["textIndexes", "arrayIndexes"] as const) {
    readOptional(extras, key, source, ROOT_PATH, (value, at) =>
      readFieldRefs(value, at, OWN_INDEXES_RULE, run),
    );
  }
  return extras;
}

function readDef(input: unknown, run: Run): IndexedGridDef | null {
  const source = readObject(input, ROOT_PATH, ROOT_KEYS, run);
  if (source === null) {
    return null;
  }
  const id = readString(pick(source, "id"), "id", ID_MAX, run, ID_PATTERN);
  const fields = readFields(pick(source, "fields"), run);
  const defaultSort = readSort(pick(source, "defaultSort"), "defaultSort", run);
  const extras = readDefExtras(source, run);
  const indexes = readIndexes(pick(source, "indexes"), run);
  if (
    id === null ||
    fields === null ||
    defaultSort === null ||
    indexes === null
  ) {
    return null;
  }
  return { id, fields, defaultSort, indexes, ...extras };
}

export function normalizeStoredGridDef(
  input: unknown,
  options: StoredDefOptions = {},
): StoredDefResult {
  const run: Run = {
    problems: [],
    allowed: options.fields ?? null,
    declared: false,
    keys: new Set(),
    fields: new Map(),
  };
  let def: IndexedGridDef | null = null;
  try {
    def = readDef(input, run);
  } catch {
    // A getter or a proxy trap on the input can throw while it is read.
    invalid(run, ROOT_PATH);
  }
  if (def === null && run.problems.length === 0) {
    invalid(run, ROOT_PATH);
  }
  if (def === null || run.problems.length > 0) {
    return { ok: false, problems: run.problems };
  }
  const problems = listIndexProblems(def).slice(0, PROBLEM_MAX);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, def };
}
