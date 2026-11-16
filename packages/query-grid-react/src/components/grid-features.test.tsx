import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BadgeCell,
  createLinkCell,
  FieldCell,
  LinkCell,
  ListCell,
} from "./cells.tsx";
import { DataGrid } from "./data-grid.tsx";
import { ExportButton } from "./export-button.tsx";
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

describe("the export button", () => {
  test("names itself and says so while it runs", () => {
    const idle = render(<ExportButton onExport={noop} />);
    expect(idle).toContain("data-export");
    expect(idle).toContain("<bdi>Export CSV</bdi>");
    expect(idle).not.toContain("aria-disabled");
    const busy = render(<ExportButton onExport={noop} exporting />);
    expect(busy).toContain("<bdi>Exporting…</bdi>");
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('aria-disabled="true"');
  });

  test("held, it carries its reason, and a refusal is shown beside it", () => {
    const held = render(
      <ExportButton onExport={noop} disabled reason="Too many rows" />,
    );
    expect(held).toContain('title="Too many rows"');
    expect(held).toContain('aria-disabled="true"');
    const failed = render(
      <ExportButton onExport={noop} error="More than 50,000 rows match." />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("More than 50,000 rows match.");
  });
});

describe("selection for bulk actions", () => {
  test("the selection bar is in the default grid, hidden while nothing is selected", () => {
    const html = render(<DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} />);
    expect(html).toContain('data-part="grid-selection"');
    expect(html).toContain('class="qg-selection qg-selection-empty"');
    expect(html).toContain("<bdi>Clear selection</bdi>");
    expect(html).not.toContain("data-select-matching");
  });

  test("a host puts its bulk actions in the bar", () => {
    const html = render(
      <DataGrid.Root fields={TEST_FIELDS} {...ROW_WINDOW}>
        <DataGrid.Selection>
          <span data-bulk>Archive</span>
        </DataGrid.Selection>
        <DataGrid.Body />
      </DataGrid.Root>,
    );
    expect(html).toContain(
      '<span class="qg-selection-actions"><span data-bulk="true">Archive</span></span>',
    );
  });
});

describe("row open and row actions", () => {
  test("with an href the first cell is a link, kept out of the tab order", () => {
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        rowHref={(row) => `/things/${row.id}`}
      />,
    );
    expect(html).toContain(
      '<a class="qg-row-open" href="/things/row-0" tabindex="-1" data-row-open="row-0">',
    );
    expect(html.match(/data-row-open=/g)).toHaveLength(TEST_ROWS.length);
  });

  test("with a callback alone it is a button, and without either the cell is plain", () => {
    const opened = render(
      <DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} onRowOpen={noop} />,
    );
    expect(opened).toContain('data-row-open="row-0"');
    expect(opened).not.toContain("<a ");
    const plain = render(<DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} />);
    expect(plain).not.toContain("data-row-open");
    expect(plain).not.toContain("data-row-actions");
  });

  test("row actions add one trailing cell a row, each trigger named for its row", () => {
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        rowLabel={(row) => String(row.name)}
        rowActions={() => <span>Rename</span>}
      />,
    );
    expect(html.match(/data-row-actions=/g)).toHaveLength(TEST_ROWS.length);
    expect(html).toContain('aria-label="Actions for Name 0"');
    expect(html.match(/qg-header-cell qg-actions-cell/g)).toHaveLength(1);
  });
});

describe("row reorder", () => {
  test("a handle a row, named for the row, and a header that says how", () => {
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        rowLabel={(row) => String(row.name)}
        onRowReorder={noop}
      />,
    );
    expect(html.match(/data-reorder-handle=/g)).toHaveLength(TEST_ROWS.length);
    expect(html).toContain('aria-label="Reorder Name 0"');
    expect(html).toContain("data-reorder-header");
    expect(html).toContain("Drag a row by its handle");
    expect(html).not.toContain('aria-disabled="true"');
  });

  test("held, every handle is disabled with the reason, and a failure is shown", () => {
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        onRowReorder={noop}
        reorder={{
          disabled: true,
          reason: "Sort by Rank ascending",
          error: "The new order was not saved",
        }}
      />,
    );
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(TEST_ROWS.length);
    expect(html).toContain('title="Sort by Rank ascending"');
    expect(html).toContain("data-reorder-error");
    expect(html).toContain("The new order was not saved");
  });

  test("a grouped grid and a grid with no hook have no handles", () => {
    const plain = render(<DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} />);
    expect(plain).not.toContain("data-reorder-handle");
    const grouped = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        onRowReorder={noop}
        groups={[]}
      />,
    );
    expect(grouped).not.toContain("data-reorder-handle");
  });
});

describe("ready-made cells", () => {
  const fields = TEST_FIELDS.map((field) => {
    if (field.key === "status") {
      return {
        ...field,
        render: "badge" as const,
        tones: { open: "success" as const },
      };
    }
    if (field.key === "name") {
      return {
        ...field,
        cell: createLinkCell((_value, row) => `/things/${row.id}`),
      };
    }
    return field;
  });

  test("a badge field renders its label in a badge with the value's tone", () => {
    const html = render(<DataGrid fields={fields} {...ROW_WINDOW} />);
    expect(html).toContain(
      '<span class="qg-badge" data-tone="success"><bdi>Open</bdi></span>',
    );
    expect(html).toContain(
      '<span class="qg-badge" data-tone="neutral"><bdi>Done</bdi></span>',
    );
  });

  test("a link cell links a safe address and leaves any other as text", () => {
    const html = render(<DataGrid fields={fields} {...ROW_WINDOW} />);
    expect(html).toContain(
      '<a class="qg-link-cell" href="/things/row-0"><bdi>Name 0</bdi></a>',
    );
    const unsafe = createLinkCell(() => "javascript:alert(1)");
    expect(render(<>{unsafe("x", TEST_ROWS[0])}</>)).toBe("<bdi>x</bdi>");
    expect(
      render(<>{createLinkCell(() => "//evil.test")("x", TEST_ROWS[0])}</>),
    ).toBe("<bdi>x</bdi>");
    expect(
      render(
        <LinkCell href="https://example.com" external>
          Docs
        </LinkCell>,
      ),
    ).toContain('target="_blank" rel="noopener noreferrer"');
  });

  test("a list cell shows the first items and counts the rest", () => {
    const html = render(<ListCell items={["a", "b", "c", "d", "e"]} max={2} />);
    expect(html.match(/qg-list-item/g)).toHaveLength(2);
    expect(html).toContain('data-list-more="3"');
    expect(html).toContain("<bdi>+3</bdi>");
    expect(render(<ListCell items={["a"]} />)).not.toContain("qg-list-more");
    expect(render(<BadgeCell label="" />)).toBe("");
  });

  test("a list field renders an array through its options' labels", () => {
    const tags = {
      key: "tags",
      label: "Tags",
      type: "array" as const,
      render: "list" as const,
      options: [{ value: "a", label: "Alpha" }],
    };
    const html = render(
      <FieldCell field={tags} value={["a", "b"]} row={TEST_ROWS[0]} />,
    );
    expect(html).toContain("<bdi>Alpha</bdi>");
    expect(html).toContain("<bdi>b</bdi>");
  });
});
