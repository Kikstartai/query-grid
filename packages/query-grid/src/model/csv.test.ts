import { describe, expect, test } from "bun:test";

import {
  CSV_BOM,
  encodeCsv,
  encodeCsvCell,
  encodeCsvRows,
  formatExportValue,
  listExportFields,
} from "./csv.ts";
import { TEST_DEF } from "./grid-def.fixture.ts";
import type { BaseFieldDef, BaseGridDef, GridRow } from "./grid-def.ts";
import { createMemorySource } from "./memory-source.ts";
import { defaultQuery } from "./query-actions.ts";
import { withScope } from "./scope.ts";

const TEXT: BaseFieldDef = { key: "name", label: "Name", type: "text" };
const MONEY: BaseFieldDef = { key: "total", label: "Total", type: "money" };
const COUNT: BaseFieldDef = { key: "delta", label: "Delta", type: "integer" };
const TAGS: BaseFieldDef = {
  key: "tags",
  label: "Tags",
  type: "array",
  options: [{ value: "a", label: "Alpha" }],
};
const STATUS = TEST_DEF.fields.find((field) => field.key === "status")!;

describe("a CSV cell", () => {
  test("text that a spreadsheet would run as a formula is led by an apostrophe", () => {
    expect(encodeCsvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(encodeCsvCell("+27 82 000")).toBe("'+27 82 000");
    expect(encodeCsvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
    expect(encodeCsvCell("@import")).toBe("'@import");
    expect(encodeCsvCell("  =1+1")).toBe("'  =1+1");
    expect(encodeCsvCell("\tTab")).toBe("'\tTab");
    expect(encodeCsvCell("\rReturn")).toBe('"\'\rReturn"');
    expect(encodeCsvCell('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
  });

  test("a number the encoder wrote keeps its sign", () => {
    expect(encodeCsvCell("-5", true)).toBe("-5");
    expect(encodeCsvCell("-5")).toBe("'-5");
  });

  test("a comma, a quote, a line break and outer spaces are quoted", () => {
    expect(encodeCsvCell("plain")).toBe("plain");
    expect(encodeCsvCell("a,b")).toBe('"a,b"');
    expect(encodeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(encodeCsvCell("two\nlines")).toBe('"two\nlines"');
    expect(encodeCsvCell(" padded ")).toBe('" padded "');
    expect(encodeCsvCell("")).toBe("");
  });
});

describe("a value in an export", () => {
  test("money is major units, an option its label, a list its labels, empty is empty", () => {
    expect(formatExportValue(MONEY, 123456)).toBe("1234.56");
    expect(formatExportValue(MONEY, -50)).toBe("-0.50");
    expect(formatExportValue(STATUS, "open")).toBe("Open");
    expect(formatExportValue(TAGS, ["a", "b"])).toBe("Alpha, b");
    expect(formatExportValue(TEXT, null)).toBe("");
    expect(formatExportValue(COUNT, 7)).toBe("7");
    expect(
      formatExportValue({ key: "ok", label: "Ok", type: "boolean" }, false),
    ).toBe("false");
  });

  test("a negative number stays a number and a negative-looking text does not", () => {
    const rows: GridRow[] = [{ id: "1", name: "-1+1", total: -150, delta: -3 }];
    expect(encodeCsvRows([TEXT, MONEY, COUNT], rows)).toBe(
      "'-1+1,-1.50,-3\r\n",
    );
  });

  test("text held in a number field is still neutralised", () => {
    const rows = [{ id: "1", delta: "=1+1" }] as unknown as GridRow[];
    expect(encodeCsvRows([COUNT], rows)).toBe("'=1+1\r\n");
  });
});

describe("the columns and the file", () => {
  test("no columns named means every field that is not hidden, in the def's order", () => {
    const def: BaseGridDef = {
      ...TEST_DEF,
      fields: TEST_DEF.fields.map((field) =>
        field.key === "id" ? { ...field, hidden: true } : field,
      ),
    };
    expect(listExportFields(def).map((field) => field.key)).toEqual([
      "number",
      "created_at",
      "total",
      "status",
      "region",
      "name",
      "note",
    ]);
    expect(
      listExportFields(def, ["name", "id", "nope", "name"]).map(
        (field) => field.key,
      ),
    ).toEqual(["name", "id"]);
  });

  test("the file starts with a byte order mark and a header of labels, and ends each line with CRLF", () => {
    const csv = encodeCsv(
      [TEXT, MONEY],
      [
        { id: "1", name: "Ann", total: 100 },
        { id: "2", name: "=Bob", total: 250 },
      ],
    );
    expect(csv).toBe(`${CSV_BOM}Name,Total\r\nAnn,1.00\r\n'=Bob,2.50\r\n`);
  });
});

describe("the in-memory source exports what the query matches", () => {
  const rows: GridRow[] = [
    { id: "a", number: 2, total: 100, status: "open", name: "x" },
    { id: "b", number: 1, total: 300, status: "done", name: "=y" },
    { id: "c", number: 3, total: 200, status: "open", name: "z" },
  ];
  const source = createMemorySource(TEST_DEF, rows);
  const signal = new AbortController().signal;
  const sorted = {
    ...defaultQuery(TEST_DEF),
    sort: { field: "number", direction: "asc" as const },
  };

  test("every matching row, sorted as the grid is, in the columns asked for", async () => {
    const csv = await source.fetchExport(
      { ...sorted, equals: { status: ["open"] } },
      { columns: ["number", "name", "total"] },
      signal,
    );
    expect(csv).toBe(`${CSV_BOM}Number,Name,Total\r\n2,x,1.00\r\n3,z,2.00\r\n`);
  });

  test("a scope narrows the export like every other read", async () => {
    const scoped = withScope(source, { equals: { status: ["done"] } });
    const csv = await scoped.fetchExport(sorted, { columns: ["name"] }, signal);
    expect(csv).toBe(`${CSV_BOM}Name\r\n'=y\r\n`);
  });
});
