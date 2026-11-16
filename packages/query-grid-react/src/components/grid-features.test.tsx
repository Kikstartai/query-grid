import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DataGrid } from "./data-grid.tsx";
import { TEST_FIELDS, TEST_ROWS } from "./fields.fixture.ts";
import { SortControl } from "./filter-bar.tsx";

const noop = () => undefined;
const ROW_WINDOW = {
  rows: TEST_ROWS,
  hasNext: false,
  onEndReached: noop,
  loading: false,
};

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function headerSort(html: string, field: string): string {
  const at = html.indexOf(`data-header-sort="${field}"`);
  return at < 0 ? "" : html.slice(html.lastIndexOf("<button", at), at + 400);
}

describe("several sort columns", () => {
  const html = render(
    <DataGrid
      fields={TEST_FIELDS}
      {...ROW_WINDOW}
      sorts={[
        { field: "total", direction: "desc" },
        { field: "number", direction: "asc" },
      ]}
      sortableFields={["total", "created_at"]}
      addableSortFields={["name"]}
      sortReasons={{ status: "No index sorts by Status." }}
      onSortChange={noop}
      onSortAdd={noop}
      onSortRemove={noop}
    />,
  );

  test("each sorted header shows its direction and its place in the order", () => {
    const total = headerSort(html, "total");
    expect(total).toContain('data-sorted="desc"');
    expect(total).toContain('data-sort-position="1"');
    expect(total).toContain('aria-label="Sort by Total"');
    const number = headerSort(html, "number");
    expect(number).toContain('data-sorted="asc"');
    expect(number).toContain('data-sort-position="2"');
    expect(number).toContain('aria-label="Sort by Number, sort column 2"');
    expect(html).toContain('class="qg-header-sort-position"');
  });

  test("a column that can only be added still has its button", () => {
    const name = headerSort(html, "name");
    expect(name).not.toBe("");
    expect(name).not.toContain("aria-disabled");
  });

  test("a sort the data cannot answer is disabled with its reason", () => {
    const status = headerSort(html, "status");
    expect(status).toContain('aria-disabled="true"');
    expect(status).toContain('title="No index sorts by Status."');
  });

  test("a column that never sorts is a plain label", () => {
    expect(headerSort(html, "note")).toBe("");
  });

  test("one sort shows no position", () => {
    const single = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        sort={{ field: "total", direction: "desc" }}
        sortableFields={["total"]}
        onSortChange={noop}
      />,
    );
    expect(single).toContain('data-sorted="desc"');
    expect(single).not.toContain("qg-header-sort-position");
  });

  test("the sort control lists the further columns, each with its direction", () => {
    const control = render(
      <SortControl
        options={[{ value: "total", label: "Total" }]}
        value="total"
        direction="desc"
        onSortChange={noop}
        thenOptions={[
          { value: "number", label: "Number" },
          {
            value: "name",
            label: "Name",
            disabled: true,
            reason: "Narrow first",
          },
        ]}
        thenBy={[{ field: "number", direction: "asc" }]}
        onSortAdd={noop}
        onSortRemove={noop}
      />,
    );
    expect(control).toContain('data-sort="then"');
    expect(control).toContain('aria-label="Then by"');
    expect(control).toContain('data-sort-then="number"');
    expect(control).toContain('aria-label="Number: Ascending"');
    const plain = render(
      <SortControl
        options={[{ value: "total", label: "Total" }]}
        value="total"
        direction="desc"
        onSortChange={noop}
      />,
    );
    expect(plain).not.toContain('data-sort="then"');
  });
});
