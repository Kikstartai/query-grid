import {
  getField,
  isNumberType,
  type BaseFieldDef,
  type BaseGridDef,
  type GridRow,
  type GridValue,
} from "./grid-def.ts";

export const CSV_BOM = "﻿";
export const CSV_TYPE = "text/csv; charset=utf-8";

const CSV_EOL = "\r\n";
const LIST_SEPARATOR = ", ";
const MONEY_DIGITS = 2;
const FORMULA_START = /^(\s*[=+\-@＝＋－＠]|[\t\r])/;

export interface ExportRequest {
  columns?: string[];
}

function formatOption(field: BaseFieldDef, value: string): string {
  return (
    field.options?.find((option) => option.value === value)?.label ?? value
  );
}

export function formatExportValue(
  field: BaseFieldDef,
  value: GridValue,
): string {
  if (value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatOption(field, item)).join(LIST_SEPARATOR);
  }
  if (field.type === "money") {
    return (Number(value) / 100).toFixed(MONEY_DIGITS);
  }
  return field.options ? formatOption(field, String(value)) : String(value);
}

// A spreadsheet runs a cell that starts like a formula, so text that does is led by an apostrophe, and every text cell is quoted so that no separator of any locale can split one into a cell that starts that way.
export function encodeCsvCell(text: string, numeric = false): string {
  if (numeric || text === "") {
    return text;
  }
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function encodeCsvRow(cells: string[]): string {
  return `${cells.join(",")}${CSV_EOL}`;
}

export function listExportFields<F extends BaseFieldDef>(
  def: BaseGridDef<F>,
  columns?: string[],
): F[] {
  if (!columns) {
    return def.fields.filter((field) => !field.hidden);
  }
  return [...new Set(columns)].flatMap((key) => getField(def, key) ?? []);
}

export function encodeCsvHeader(fields: BaseFieldDef[]): string {
  return encodeCsvRow(fields.map((field) => encodeCsvCell(field.label)));
}

export function encodeCsvRows(fields: BaseFieldDef[], rows: GridRow[]): string {
  return rows
    .map((row) =>
      encodeCsvRow(
        fields.map((field) =>
          encodeCsvCell(
            formatExportValue(field, row[field.key] ?? null),
            isNumberType(field.type) &&
              !field.options &&
              typeof row[field.key] === "number",
          ),
        ),
      ),
    )
    .join("");
}

export function encodeCsv(fields: BaseFieldDef[], rows: GridRow[]): string {
  return `${CSV_BOM}${encodeCsvHeader(fields)}${encodeCsvRows(fields, rows)}`;
}
