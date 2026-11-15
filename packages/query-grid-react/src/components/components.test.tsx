import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_VALUE, NOT_EMPTY_VALUE } from "@kikstart/query-grid";

import { CardList } from "./card-list.tsx";
import { defaultColumns } from "./column-state.ts";
import { ColumnsMenu } from "./columns-menu.tsx";
import { CountDisplay, TotalFooter } from "./count-display.tsx";
import { DataGrid } from "./data-grid.tsx";
import { FacetPanel } from "./facet-panel.tsx";
import { EqualsSelect, LookupFilter, RangeFilter } from "./field-filter.tsx";
import { ReasonDisplayContext } from "./field-frame.tsx";
import { ContainsFilter, MatchToggle } from "./narrow-filters.tsx";
import { TEST_FIELDS, TEST_ROWS } from "./fields.fixture.ts";
import {
  FilterBar,
  FilterChips,
  SearchFilter,
  SortControl,
} from "./filter-bar.tsx";
import { FilterSidebar } from "./filter-sidebar.tsx";
import {
  formatLoaded,
  formatRows,
  DEFAULT_MESSAGES,
  QueryGridMessagesProvider,
} from "./messages.tsx";
import { StatusBoard } from "./status-board.tsx";
import { ViewSwitch } from "./view-switch.tsx";

const noop = () => undefined;
const STATUS = TEST_FIELDS.find((field) => field.key === "status")!;
const TOTAL = TEST_FIELDS.find((field) => field.key === "total")!;
const NUMBER = TEST_FIELDS.find((field) => field.key === "number")!;
const CREATED = TEST_FIELDS.find((field) => field.key === "created_at")!;
const NAME = { ...TEST_FIELDS[6] };
const NOTE = TEST_FIELDS.find((field) => field.key === "note")!;
const OWNER = {
  key: "owner",
  label: "Owner",
  type: "enum" as const,
  nullable: true,
  options: [{ value: "ann", label: "Ann" }],
};
const ROW_WINDOW = {
  rows: TEST_ROWS,
  hasNext: false,
  onEndReached: noop,
  loading: false,
};

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function DisabledSort() {
  return (
    <SortControl
      options={[{ value: "total", label: "Total" }]}
      value="total"
      direction="asc"
      onSortChange={noop}
      disabled
      reason="Not now"
    />
  );
}

describe("each base component mounts alone, with plain props and no provider", () => {
  test("DataGrid", () => {
    const html = render(<DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} />);
    expect(html).toContain('data-part="grid"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('data-header="status"');
    expect(html).toContain("6 rows loaded");
    expect(html).toContain("end of results");
    expect(html).toContain('aria-label="Select all loaded rows"');
  });

  test("DataGrid parts compose under a Root, and a part needs one", () => {
    const html = render(
      <DataGrid.Root fields={TEST_FIELDS} {...ROW_WINDOW}>
        <DataGrid.Body />
        <DataGrid.Toolbar>
          <DataGrid.Status />
        </DataGrid.Toolbar>
      </DataGrid.Root>,
    );
    expect(html).toContain('role="grid"');
    expect(html).toContain("6 rows loaded");
    expect(html).not.toContain("columns-menu-trigger");
    expect(html.indexOf('data-part="grid-scroller"')).toBeLessThan(
      html.indexOf('data-part="grid-status"'),
    );
    const bodyOnly = render(
      <DataGrid.Root fields={TEST_FIELDS} {...ROW_WINDOW}>
        <DataGrid.Body />
      </DataGrid.Root>,
    );
    expect(bodyOnly).not.toContain("qg-grid-toolbar");
    expect(() => render(<DataGrid.Status />)).toThrow("DataGrid.Root");
  });

  test("DataGrid with a sort, a header filter and controlled columns", () => {
    const columns = defaultColumns(TEST_FIELDS).map((column) =>
      column.key === "note" ? { ...column, visible: false } : column,
    );
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        columns={columns}
        onColumnsChange={noop}
        sort={{ field: "total", direction: "asc" }}
        sortableFields={["total"]}
        onSortChange={noop}
        filters={{ status: <span>status filter</span> }}
        activeFilters={["status"]}
      />,
    );
    expect(html).toContain('data-header-sort="total"');
    expect(html).toContain('data-sorted="asc"');
    expect(html).toContain('aria-label="Filter Status"');
    expect(html).not.toContain('data-header="note"');
  });

  test("DataGrid states", () => {
    const empty = { ...ROW_WINDOW, rows: [] };
    expect(render(<DataGrid fields={TEST_FIELDS} {...empty} />)).toContain(
      "No rows match.",
    );
    const loading = render(
      <DataGrid fields={TEST_FIELDS} {...empty} loading />,
    );
    expect(loading).toContain("Loading…");
    expect(loading).not.toContain('data-status="loaded"');
    expect(
      render(<DataGrid fields={TEST_FIELDS} {...empty} pages={0} />),
    ).not.toContain('data-status="loaded"');
    expect(
      render(<DataGrid fields={TEST_FIELDS} {...empty} pages={1} />),
    ).toContain('data-status="loaded"');
    expect(
      render(<DataGrid fields={TEST_FIELDS} {...empty} error="It broke" />),
    ).toContain("It broke");
  });

  test("ColumnsMenu", () => {
    const html = render(
      <ColumnsMenu
        fields={TEST_FIELDS}
        columns={defaultColumns(TEST_FIELDS)}
        onColumnsChange={noop}
      />,
    );
    expect(html).toContain('data-part="columns-menu-trigger"');
    expect(html).toContain("Columns");
  });

  test("CardList", () => {
    const html = render(
      <CardList
        fields={TEST_FIELDS}
        {...ROW_WINDOW}
        titleField="number"
        badgeField="status"
      />,
    );
    expect(html).toContain('data-part="list"');
    expect(html).toContain("6 rows loaded");
  });

  test("CardList renders a field through its cell in the title, the badge and the body", () => {
    const marked = TEST_FIELDS.map((field) => ({
      ...field,
      cell: ["number", "status", "region"].includes(field.key)
        ? (value: string | number | null) => (
            <mark data-cell={field.key}>{value}</mark>
          )
        : undefined,
    }));
    const html = render(
      <CardList
        fields={marked}
        {...ROW_WINDOW}
        titleField="number"
        badgeField="status"
      />,
    );
    const first = TEST_ROWS[0];
    expect(html).toContain(
      `<bdi>Number</bdi> <mark data-cell="number">${first.number}</mark>`,
    );
    expect(html).toContain(
      `<span class="qg-badge" data-value="${first.status}"><mark data-cell="status">${first.status}</mark></span>`,
    );
    expect(html).toContain(
      `<dd><mark data-cell="region">${first.region}</mark></dd>`,
    );
    expect(html).toContain("<dd><bdi>");
  });

  test("StatusBoard over generic lanes", () => {
    const html = render(
      <StatusBoard
        lanes={[
          {
            id: "open",
            label: "Open",
            count: 1234,
            rows: TEST_ROWS.filter((row) => row.status === "open"),
            hasNext: false,
            onEndReached: noop,
          },
          {
            id: "done",
            label: "Done",
            rows: TEST_ROWS.filter((row) => row.status === "done"),
            hasNext: false,
            onEndReached: noop,
          },
        ]}
        fields={TEST_FIELDS}
        titleField="number"
        detailFields={["name", "total"]}
        onMove={noop}
        canMove={() => true}
      />,
    );
    expect(html).toContain('data-part="board"');
    expect(html).toContain('data-column="open"');
    expect(html).toContain('data-column="done"');
    expect(html).toContain("1,234");
    expect(html).toContain("Drag a card");
  });

  test("FilterBar, SortControl and SearchFilter", () => {
    const html = render(
      <FilterBar>
        <SearchFilter value="" onValueChange={noop} fieldLabels={["Name"]} />
        <SortControl
          options={[
            { value: "created_at", label: "Created" },
            { value: "total", label: "Total", disabled: true },
          ]}
          value="created_at"
          direction="desc"
          onSortChange={noop}
        />
      </FilterBar>,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('placeholder="Search: Name"');
    expect(html).toContain('aria-label="Sort by"');
    expect(html).toContain('aria-label="Descending"');
  });

  test("a disabled control carries its reason", () => {
    const html = render(<DisabledSort />);
    expect(html).toContain("data-unavailable");
    expect(html).toContain('title="Not now"');
    expect(html).not.toContain("data-field-reason");
    expect(
      render(
        <ReasonDisplayContext value={true}>
          <DisabledSort />
        </ReasonDisplayContext>,
      ),
    ).toContain("data-field-reason");
  });

  test("each filter variant", () => {
    const single = render(
      <EqualsSelect field={STATUS} values={["open"]} onValuesChange={noop} />,
    );
    expect(single).toContain('aria-label="Status filter"');
    expect(single).not.toContain("data-multiple");
    const multiple = render(
      <EqualsSelect
        field={STATUS}
        values={["open", "done"]}
        onValuesChange={noop}
        multiple
      />,
    );
    expect(multiple).toContain("data-multiple");
    const lookup = render(
      <LookupFilter
        field={NAME}
        values={["a", "b"]}
        valueLabels={{ a: "Alpha", b: "Beta" }}
        onValuesChange={noop}
        loadOptions={async () => []}
        multiple
      />,
    );
    expect(lookup).toContain("Alpha");
    expect(lookup).toContain('aria-label="Remove Beta"');
    const money = render(
      <RangeFilter
        field={TOTAL}
        range={{ min: "1000", max: null }}
        onRangeChange={noop}
      />,
    );
    expect(money).toContain('aria-label="Total from"');
    const dates = render(
      <RangeFilter field={CREATED} range={null} onRangeChange={noop} />,
    );
    expect(dates).toContain('aria-label="Created period"');
    expect(dates).not.toContain('aria-label="Pick Created dates"');
    const custom = render(
      <RangeFilter
        field={CREATED}
        range={{
          min: "2026-01-01T00:00:00.000000Z",
          max: "2026-01-31T23:59:59.999999Z",
        }}
        onRangeChange={noop}
      />,
    );
    expect(custom).toContain('aria-label="Pick Created dates"');
    expect(custom).toContain("Custom…");
    const preset = render(
      <RangeFilter
        field={CREATED}
        range={{ min: null, max: null, preset: "last-7-days" }}
        onRangeChange={noop}
      />,
    );
    expect(preset).toContain("Last 7 days");
    expect(preset).not.toContain('aria-label="Pick Created dates"');
  });

  test("a nullable field words its reserved values through the messages", () => {
    const empty = render(
      <EqualsSelect
        field={OWNER}
        values={[EMPTY_VALUE, "ann"]}
        onValuesChange={noop}
        multiple
      />,
    );
    expect(empty).toContain("(empty)");
    expect(empty).toContain("Ann");
    const translated = render(
      <QueryGridMessagesProvider messages={{ notEmptyValue: "(ingevul)" }}>
        <LookupFilter
          field={NOTE}
          values={[NOT_EMPTY_VALUE]}
          onValuesChange={noop}
          loadOptions={async () => []}
          multiple
        />
      </QueryGridMessagesProvider>,
    );
    expect(translated).toContain("(ingevul)");
    expect(translated).toContain('aria-label="Remove (ingevul)"');
    const plain = render(
      <EqualsSelect
        field={STATUS}
        values={[EMPTY_VALUE]}
        onValuesChange={noop}
      />,
    );
    expect(plain).not.toContain("(empty)");
  });

  test("an excluding select marks its trigger and offers the toggle only when it may", () => {
    const excluding = render(
      <EqualsSelect
        field={STATUS}
        values={["open"]}
        onValuesChange={noop}
        multiple
        excluded
        canExclude
        onExcludedChange={noop}
      />,
    );
    expect(excluding).toContain("Status ≠");
    expect(excluding).toContain('data-filter-exclude="status"');
    expect(excluding).toContain('aria-pressed="true"');
    const plain = render(
      <EqualsSelect field={STATUS} values={["open"]} onValuesChange={noop} />,
    );
    expect(plain).not.toContain("data-filter-exclude");
    const idle = render(
      <EqualsSelect
        field={STATUS}
        values={[]}
        onValuesChange={noop}
        canExclude
        onExcludedChange={noop}
      />,
    );
    expect(idle).toMatch(/data-filter-exclude="status"[^>]*disabled/);
  });

  test("ContainsFilter names its field and its text, and carries a reason when held", () => {
    const options = [
      { value: "name", label: "Name" },
      { value: "note", label: "Note" },
    ];
    const html = render(
      <ContainsFilter
        options={options}
        field="note"
        value="gift"
        onContainsChange={noop}
      />,
    );
    expect(html).toContain('data-field="contains"');
    expect(html).toContain('aria-label="Note contains"');
    expect(html).toContain('value="gift"');
    const held = render(
      <ReasonDisplayContext value={true}>
        <ContainsFilter
          options={options}
          field={null}
          value=""
          onContainsChange={noop}
          disabled
          reason="Narrow by Status first: 2,300,000+ rows."
        />
      </ReasonDisplayContext>,
    );
    expect(held).toContain("data-unavailable");
    expect(held).toContain("Narrow by Status first: 2,300,000+ rows.");
    expect(held).toContain('aria-label="Name contains"');
  });

  test("MatchToggle keeps Match all reachable when Match any is held", () => {
    const free = render(<MatchToggle value="any" onValueChange={noop} />);
    expect(free).toContain("Match all");
    expect(free).toContain("Match any");
    expect(free).toMatch(/data-match="any"[^>]*aria-checked="true"/);
    const held = render(
      <MatchToggle
        value="all"
        onValueChange={noop}
        disabled
        reason="Narrow the filters first."
      />,
    );
    expect(held).toContain('title="Narrow the filters first."');
    expect(held).toMatch(/data-match="any"[^>]*disabled/);
    expect(held).not.toMatch(/data-match="all"[^>]*disabled/);
  });

  test("FilterChips with one chip per field and one remove per value", () => {
    const html = render(
      <FilterChips
        chips={[
          {
            id: "eq:status",
            kind: "equals",
            label: "Status:",
            values: [
              { id: "open", label: "Open" },
              { id: "done", label: "Done" },
            ],
            removable: true,
          },
          {
            id: "sort",
            kind: "sort",
            label: "Sort: Created ↓",
            removable: false,
          },
        ]}
        onRemove={noop}
        onReset={noop}
      />,
    );
    expect(html.match(/data-chip=/g)).toHaveLength(2);
    expect(html.match(/data-chip-remove="eq:status"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Remove Status: Done"');
    expect(html).toContain('data-chip-value="open"');
  });

  test("FilterSidebar", () => {
    const html = render(
      <FilterSidebar activeCount={2} onReset={noop}>
        <span>body</span>
      </FilterSidebar>,
    );
    expect(html).toContain('data-part="filter-sidebar-trigger"');
    expect(html).toContain('data-sidebar-active="2"');
  });

  test("FacetPanel", () => {
    const html = render(
      <FacetPanel
        label="Status"
        options={[
          { value: "open", label: "Open", count: 30 },
          { value: "done", label: "Done", count: 10 },
        ]}
        values={["open"]}
        onValuesChange={noop}
        total={40}
        note="A note"
      />,
    );
    expect(html).toContain('data-facet="open"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">40<");
    expect(html).toContain("A note");
  });

  test("ViewSwitch", () => {
    const html = render(
      <ViewSwitch
        views={[
          { view: "grid", label: "Grid" },
          { view: "list", label: "List" },
        ]}
        value="grid"
        onValueChange={noop}
      />,
    );
    expect(html).toContain('data-view="list"');
    expect(html).toContain('aria-label="View"');
    expect(html).not.toContain("segmented-control-indicator");
  });

  test("CountDisplay", () => {
    const capped = render(
      <CountDisplay
        status="idle"
        value={{ count: 10000, capped: true, source: "capped" }}
        onRequestExact={noop}
      />,
    );
    expect(capped).toContain("10,000+ rows");
    expect(capped).toContain("Exact count");
    expect(render(<CountDisplay status="loading" value={null} />)).toContain(
      "Counting…",
    );
    expect(
      render(
        <CountDisplay
          status="idle"
          value={{ count: 1, capped: false, source: "exact" }}
        />,
      ),
    ).toContain("1 row<");
  });

  test("TotalFooter", () => {
    const live = render(
      <TotalFooter
        totals={[
          { field: TOTAL, value: { sum: 123456, rows: 2, source: "live" } },
          { field: NUMBER, value: { sum: 2001, rows: 2, source: "live" } },
        ]}
      />,
    );
    expect(live).toContain('data-total-field="total"');
    expect(live).toContain("Total sum");
    expect(live).toContain("$1,234.56");
    expect(live).toContain('data-total-field="number"');
    expect(live).toContain("Number sum");
    expect(live).toContain("2,001");
    expect(live.match(/summed live over 2 rows/g)).toHaveLength(1);
    const refused = render(
      <TotalFooter
        totals={[
          { field: TOTAL, value: null, reason: "Too many" },
          { field: NUMBER, value: null, reason: "Too many" },
        ]}
      />,
    );
    expect(refused.match(/Too many/g)).toHaveLength(1);
    expect(refused).toContain('data-total="unavailable"');
    expect(
      render(<TotalFooter totals={[{ field: TOTAL, value: null }]} />),
    ).toContain("Totalling…");
    expect(render(<TotalFooter totals={[]} />)).toBe("");
  });
});

describe("messages", () => {
  test("plurals follow the locale's rules, not an English ternary", () => {
    expect(formatRows(DEFAULT_MESSAGES, 1, "en")).toBe("1 row");
    expect(formatRows(DEFAULT_MESSAGES, 0, "en")).toBe("0 rows");
    expect(formatRows(DEFAULT_MESSAGES, 620000, "de-DE")).toBe("620.000 rows");
    expect(formatLoaded(DEFAULT_MESSAGES, 500, 1, "en")).toBe(
      "500 rows loaded in 1 keyset page",
    );
    const welsh = {
      ...DEFAULT_MESSAGES,
      rows: ({ count, locale }: { count: number; locale: string }) =>
        new Intl.PluralRules(locale).select(count),
    };
    expect(formatRows(welsh, 2, "cy")).toBe("two");
    expect(formatRows(welsh, 3, "cy")).toBe("few");
  });

  test("the provider's locale formats every number, and each money field carries its own currency", () => {
    const rand = { ...TOTAL, currency: "ZAR" };
    const euro = { ...TOTAL, key: "fee", label: "Fee", currency: "EUR" };
    const html = render(
      <QueryGridMessagesProvider locale="de-DE">
        <CountDisplay
          status="idle"
          value={{ count: 620000, capped: false, source: "exact" }}
        />
        <TotalFooter
          totals={[
            { field: rand, value: { sum: 123456, rows: 1200, source: "live" } },
            { field: euro, value: { sum: 123456, rows: 1200, source: "live" } },
            { field: NUMBER, value: { sum: 2001, rows: 1200, source: "live" } },
          ]}
        />
        <DataGrid
          fields={[...TEST_FIELDS, euro]}
          {...ROW_WINDOW}
          rows={[{ ...TEST_ROWS[0], fee: 250000 }]}
        />
      </QueryGridMessagesProvider>,
    );
    expect(html).toContain("620.000 rows");
    expect(html).toContain("1.234,56 ZAR");
    expect(html).toContain("1.234,56 €");
    expect(html).toContain("2.001");
    expect(html).toContain("summed live over 1.200 rows");
    expect(html).toContain("2.500,00 €");
    expect(html).toContain("1,00 $");
    const plain = render(
      <CountDisplay
        status="idle"
        value={{ count: 620000, capped: false, source: "exact" }}
      />,
    );
    expect(plain).toContain("620,000 rows");
  });

  test("the provider's messages replace the defaults in every component", () => {
    const html = render(
      <QueryGridMessagesProvider
        messages={{
          noRows: "Geen rye nie.",
          columns: "Kolomme",
          rows: ({ formatted }) => `${formatted} rye`,
          selectAll: "Kies alles",
          reset: "Herstel",
          countSources: { exact: "presiese telling" },
          facetNotes: { following: "Tellings volg die filters." },
        }}
      >
        <DataGrid fields={TEST_FIELDS} {...ROW_WINDOW} rows={[]} />
        <CountDisplay
          status="idle"
          value={{ count: 7, capped: false, source: "exact" }}
        />
        <FilterChips chips={[]} onRemove={noop} onReset={noop} />
      </QueryGridMessagesProvider>,
    );
    expect(html).toContain("Geen rye nie.");
    expect(html).toContain("Kolomme");
    expect(html).toContain("7 rye");
    expect(html).toContain("presiese telling");
    expect(html).toContain('aria-label="Kies alles"');
    expect(html).toContain("Herstel");
    expect(html).not.toContain("No rows match.");
    expect(html).not.toContain("Columns");
  });

  test("a nested provider keeps what the outer one set and it does not name", () => {
    const html = render(
      <QueryGridMessagesProvider
        locale="de-DE"
        messages={{ countSources: { exact: "genau" } }}
      >
        <QueryGridMessagesProvider messages={{ countSources: { capped: "x" } }}>
          <CountDisplay
            status="idle"
            value={{ count: 1234, capped: false, source: "exact" }}
          />
        </QueryGridMessagesProvider>
        <QueryGridMessagesProvider locale="en">
          <CountDisplay
            status="idle"
            value={{ count: 5678, capped: false, source: "exact" }}
          />
        </QueryGridMessagesProvider>
      </QueryGridMessagesProvider>,
    );
    expect(html).toContain("1.234 rows");
    expect(html.match(/genau/g)).toHaveLength(2);
    expect(html).toContain("5,678 rows");
  });

  test("an override keeps the defaults it does not name", () => {
    const html = render(
      <QueryGridMessagesProvider messages={{ countSources: { exact: "x" } }}>
        <CountDisplay
          status="idle"
          value={{ count: 7, capped: false, source: "counter" }}
        />
      </QueryGridMessagesProvider>,
    );
    expect(html).toContain("exact, from the counter table");
  });
});
