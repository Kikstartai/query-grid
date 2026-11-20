import { SelectContent } from "@ui-sdk/react/select";
import { describe, expect, test } from "bun:test";
import * as React from "react";
import { Children, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Filter, FilterOp, GridValue } from "@kikstart/query-grid";

import { CardList } from "./card-list.tsx";
import { defaultColumns } from "./column-state.ts";
import { ColumnsMenu } from "./columns-menu.tsx";
import { CountDisplay, TotalFooter } from "./count-display.tsx";
import { DataGrid } from "./data-grid.tsx";
import { FacetPanel } from "./facet-panel.tsx";
import { CombineToggle } from "./combine-toggle.tsx";
import { EqualsSelect, FieldFilter, LookupFilter } from "./field-filter.tsx";
import { ReasonDisplayContext } from "./field-frame.tsx";
import type { FieldDef } from "./fields.ts";
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
const CUSTOMER: FieldDef = {
  key: "customer",
  label: "Customer",
  type: "id",
  lookup: { labelField: "customer_name" },
};
const COLOURS: FieldDef = {
  key: "colours",
  label: "Colours",
  type: "array",
  nullable: true,
  options: [{ value: "red", label: "Red" }],
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

interface HookDispatcher {
  useState: (initial: unknown) => [unknown, () => void];
  use: (context: { _currentValue: unknown }) => unknown;
}

interface ElementProps {
  children?: ReactNode;
  [prop: string]: unknown;
}

type ShallowElement = ReactElement<ElementProps>;

const REACT_INTERNALS = (
  React as unknown as Record<string, { H: HookDispatcher | null }>
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

// No DOM runs here, so a callback a control hands its parts is reached by rendering one level at a time.
function renderShallow(element: ReactElement): ShallowElement {
  const previous = REACT_INTERNALS.H;
  REACT_INTERNALS.H = {
    useState: (initial) => [
      typeof initial === "function" ? initial() : initial,
      noop,
    ],
    use: (context) => context._currentValue,
  };
  try {
    const component = element.type as (props: unknown) => ShallowElement;
    return component(element.props);
  } finally {
    REACT_INTERNALS.H = previous;
  }
}

function listElements(element: ShallowElement): ShallowElement[] {
  return Children.toArray(element.props.children) as ShallowElement[];
}

function findChild(element: ShallowElement, type: unknown): ShallowElement {
  const found = listElements(element).find((child) =>
    typeof type === "string"
      ? (child.type as { name?: string }).name === type
      : child.type === type,
  );
  if (!found) {
    throw new Error("no such child");
  }
  return found;
}

function choose(select: ShallowElement, op: FilterOp) {
  (select.props.onOpChange as (op: FilterOp) => void)(op);
}

function listOptions(content: ShallowElement) {
  return listElements(content).map(({ props }) => ({
    value: props.value,
    label: props.label,
    disabled: props.disabled,
    reason: props.reason,
  }));
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

  test("DataGrid with groups mixes header rows, the rows of an open group and its load more", () => {
    const html = render(
      <DataGrid
        fields={TEST_FIELDS}
        rows={[]}
        hasNext={false}
        onEndReached={noop}
        loading={false}
        groups={[
          {
            key: "open",
            label: "Open",
            count: "3 rows",
            detail: "Total sum $9.00",
            expanded: true,
            rows: TEST_ROWS.slice(0, 3),
            hasNext: true,
            loading: false,
          },
          {
            key: "done",
            label: "Done",
            count: "10,000+ rows",
            expanded: false,
            rows: [],
            hasNext: false,
            loading: false,
          },
        ]}
        onGroupToggle={noop}
        onGroupLoadMore={noop}
      />,
    );
    expect(html).toContain("data-grouped");
    expect(html.match(/data-group="/g)).toHaveLength(2);
    expect(html).toMatch(/aria-expanded="true"[^>]*data-group-toggle="open"/);
    expect(html).toMatch(/aria-expanded="false"[^>]*data-group-toggle="done"/);
    expect(html).toContain('aria-label="Open group"');
    expect(html).toContain("10,000+ rows");
    expect(html).toContain("Total sum $9.00");
    expect(html.match(/data-row-id=/g)).toHaveLength(3);
    expect(html).toContain('data-group-more="open"');
    expect(html).not.toContain('data-group-more="done"');
    expect(html).toContain('data-value="3"');
  });

  test("DataGrid with no groups yet shows the loading notice, and an error in place of the groups", () => {
    const loading = render(
      <DataGrid
        fields={TEST_FIELDS}
        rows={[]}
        hasNext={false}
        onEndReached={noop}
        loading
        groups={[]}
      />,
    );
    expect(loading).toContain('data-feed-state="loading"');
    const failed = render(
      <DataGrid
        fields={TEST_FIELDS}
        rows={[]}
        hasNext={false}
        onEndReached={noop}
        loading={false}
        error="Narrow the filters first."
        groups={[]}
      />,
    );
    expect(failed).toContain("Narrow the filters first.");
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
        ? (value: GridValue) => (
            <mark data-cell={field.key}>{String(value)}</mark>
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
      <FieldFilter
        field={TOTAL}
        ops={[{ op: "between" }, { op: "greater_or_equal" }]}
        filter={{ field: "total", op: "between", min: "1000", max: "2000" }}
        onFilterChange={noop}
      />,
    );
    expect(money).toContain('data-kind="number"');
    expect(money).toContain('aria-label="Total from"');
    expect(money).toContain('aria-label="Total to"');
    const dates = render(
      <FieldFilter
        field={CREATED}
        ops={[{ op: "between" }, { op: "in_period" }]}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(dates).toContain('data-kind="date"');
    expect(dates).toContain('aria-label="Created period"');
    expect(dates).not.toContain('aria-label="Pick Created dates"');
    const custom = render(
      <FieldFilter
        field={CREATED}
        ops={[{ op: "between" }, { op: "in_period" }]}
        filter={{
          field: "created_at",
          op: "between",
          min: "2026-01-01",
          max: "2026-01-31",
        }}
        onFilterChange={noop}
      />,
    );
    expect(custom).toContain('aria-label="Pick Created dates"');
    expect(custom).toContain(">between<");
    const preset = render(
      <FieldFilter
        field={CREATED}
        ops={[{ op: "between" }, { op: "in_period" }]}
        filter={{ field: "created_at", op: "in_period", preset: "last-7-days" }}
        onFilterChange={noop}
      />,
    );
    expect(preset).toContain("Last 7 days");
    expect(preset).toContain('data-filter="created_at.preset"');
    expect(preset).not.toContain('aria-label="Pick Created dates"');
  });

  test("a nullable field words its blank value through the messages", () => {
    const blank = render(
      <EqualsSelect
        field={OWNER}
        values={[null, "ann"]}
        onValuesChange={noop}
        multiple
        blank
      />,
    );
    expect(blank).toContain("(blank)");
    expect(blank).toContain("Ann");
    const translated = render(
      <QueryGridMessagesProvider messages={{ blankValue: "(leeg)" }}>
        <LookupFilter
          field={NOTE}
          values={[null]}
          onValuesChange={noop}
          loadOptions={async () => []}
          multiple
          blank
        />
      </QueryGridMessagesProvider>,
    );
    expect(translated).toContain("(leeg)");
    expect(translated).toContain('aria-label="Remove (leeg)"');
    const plain = render(
      <EqualsSelect field={STATUS} values={[]} onValuesChange={noop} />,
    );
    expect(plain).not.toContain("(blank)");
  });

  test("FieldFilter lists the ops it is given, each held one with its reason", () => {
    const frame = renderShallow(
      <FieldFilter
        field={TOTAL}
        ops={[
          { op: "between" },
          { op: "greater_than" },
          {
            op: "not_between",
            disabled: true,
            reason: "Narrow by Status first.",
          },
        ]}
        filter={null}
        onFilterChange={noop}
      />,
    );
    const select = renderShallow(findChild(frame, "OpSelect"));
    expect(select.props.value).toBe("between");
    expect(listOptions(findChild(select, SelectContent))).toEqual([
      { value: "between", label: "between", disabled: undefined, reason: null },
      {
        value: "greater_than",
        label: "greater than",
        disabled: undefined,
        reason: null,
      },
      {
        value: "not_between",
        label: "not between",
        disabled: true,
        reason: "Narrow by Status first.",
      },
    ]);
    const html = render(
      <FieldFilter
        field={TOTAL}
        ops={[{ op: "between" }, { op: "greater_than" }]}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(html).toContain('aria-label="Total operator"');
    expect(html).toContain('data-filter="total.op"');
    const alone = render(
      <FieldFilter
        field={TOTAL}
        ops={[{ op: "between" }]}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(alone).not.toContain('data-filter="total.op"');
    expect(alone).toContain('data-filter="total.min"');
  });

  test("choosing a blank operator filters at once, and another waits for a value", () => {
    const changes: (Filter | null)[] = [];
    const frame = renderShallow(
      <FieldFilter
        field={NOTE}
        ops={[{ op: "contains" }, { op: "blank" }, { op: "not_blank" }]}
        filter={null}
        onFilterChange={(filter) => changes.push(filter)}
      />,
    );
    const select = findChild(frame, "OpSelect");
    choose(select, "blank");
    choose(select, "contains");
    expect(changes).toEqual([{ field: "note", op: "blank" }]);
    const blank = render(
      <FieldFilter
        field={NOTE}
        ops={[{ op: "contains" }, { op: "blank" }]}
        filter={{ field: "note", op: "blank" }}
        onFilterChange={noop}
      />,
    );
    expect(blank).toContain(">blank<");
    expect(blank).not.toContain('data-filter="note.value"');
  });

  test("switching the operator keeps what it can of the value", () => {
    const changes: (Filter | null)[] = [];
    const frame = renderShallow(
      <FieldFilter
        field={TOTAL}
        ops={[{ op: "between" }, { op: "greater_than" }, { op: "not_between" }]}
        filter={{ field: "total", op: "between", min: "5", max: "9" }}
        onFilterChange={(filter) => changes.push(filter)}
      />,
    );
    const select = findChild(frame, "OpSelect");
    choose(select, "greater_than");
    choose(select, "not_between");
    expect(changes).toEqual([
      { field: "total", op: "greater_than", value: "5" },
      { field: "total", op: "not_between", min: "5", max: "9" },
    ]);
  });

  test("the list editor is a select over options and a lookup over anything else", () => {
    const options = render(
      <FieldFilter
        field={STATUS}
        ops={[{ op: "any_of" }, { op: "none_of" }]}
        filter={{ field: "status", op: "any_of", values: ["open"] }}
        onFilterChange={noop}
      />,
    );
    expect(options).toContain('data-kind="choice"');
    expect(options).toMatch(/<button[^>]*data-filter="status"/);
    expect(options).toContain('data-filter-clear="status"');
    const lookup = render(
      <FieldFilter
        field={CUSTOMER}
        ops={[{ op: "any_of" }, { op: "none_of" }]}
        filter={null}
        onFilterChange={noop}
        loadOptions={async () => []}
      />,
    );
    expect(lookup).toMatch(/<input[^>]*data-filter="customer"/);
    expect(lookup).toContain('role="combobox"');
  });

  test("a (blank) choice is offered only for any of, on a nullable field that is not an array", () => {
    const isBlankOffered = (field: FieldDef, op: FilterOp) => {
      const frame = renderShallow(
        <FieldFilter
          field={field}
          ops={[{ op: "any_of" }, { op: "none_of" }]}
          filter={{ field: field.key, op, values: ["x"] } as Filter}
          onFilterChange={noop}
        />,
      );
      const editor = renderShallow(findChild(frame, "ValueEditor"));
      return renderShallow(editor).props.blank;
    };
    expect(isBlankOffered(OWNER, "any_of")).toBe(true);
    expect(isBlankOffered(OWNER, "none_of")).toBe(false);
    expect(isBlankOffered(STATUS, "any_of")).toBe(false);
    expect(isBlankOffered(COLOURS, "any_of")).toBe(false);
    const html = render(
      <FieldFilter
        field={OWNER}
        ops={[{ op: "any_of" }, { op: "none_of" }]}
        filter={{ field: "owner", op: "any_of", values: [null, "ann"] }}
        onFilterChange={noop}
      />,
    );
    expect(html).toContain("(blank) and Ann");
  });

  test("the text editor names its field and operator, and hints at the length its index needs", () => {
    const ops = [
      { op: "contains" as const, minLength: 3 },
      { op: "starts_with" as const, minLength: 3 },
    ];
    const short = render(
      <FieldFilter
        field={NAME}
        ops={ops}
        filter={{ field: "name", op: "contains", value: "in" }}
        onFilterChange={noop}
      />,
    );
    expect(short).toContain('data-kind="text"');
    expect(short).toContain('aria-label="Name contains"');
    expect(short).toContain('data-filter="name.value"');
    expect(short).toContain("data-text-hint");
    expect(short).toContain("<bdi>3 characters or more</bdi>");
    const long = render(
      <FieldFilter
        field={NAME}
        ops={ops}
        filter={{ field: "name", op: "starts_with", value: "inv" }}
        onFilterChange={noop}
      />,
    );
    expect(long).toContain('aria-label="Name starts with"');
    expect(long).toContain('value="inv"');
    expect(long).not.toContain("data-text-hint");
    const idle = render(
      <FieldFilter
        field={NAME}
        ops={ops}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(idle).toContain('aria-label="Name contains"');
    expect(idle).not.toContain("data-text-hint");
  });

  test("a held FieldFilter carries its reason", () => {
    const held = render(
      <ReasonDisplayContext value={true}>
        <FieldFilter
          field={NOTE}
          ops={[{ op: "contains", disabled: true }]}
          filter={null}
          onFilterChange={noop}
          disabled
          reason="Narrow by Status first: 2,300,000+ rows."
        />
      </ReasonDisplayContext>,
    );
    expect(held).toContain("data-unavailable");
    expect(held).toContain("Narrow by Status first: 2,300,000+ rows.");
    expect(held).toContain('aria-label="Note contains"');
    expect(held).toMatch(/data-filter="note\.value"[^>]*disabled/);
  });

  test("CombineToggle keeps Match all reachable when Match any is held", () => {
    const free = render(<CombineToggle value="or" onValueChange={noop} />);
    expect(free).toContain("Match all");
    expect(free).toContain("Match any");
    expect(free).toMatch(/data-combine="or"[^>]*aria-checked="true"/);
    const held = render(
      <CombineToggle
        value="and"
        onValueChange={noop}
        disabled
        reason="Narrow the filters first."
      />,
    );
    expect(held).toContain('title="Narrow the filters first."');
    expect(held).toMatch(/data-combine="or"[^>]*disabled/);
    expect(held).not.toMatch(/data-combine="and"[^>]*disabled/);
  });

  test("FilterChips with one chip per field and one remove per value", () => {
    const html = render(
      <FilterChips
        chips={[
          {
            id: "filter:status:any_of",
            kind: "filter",
            label: "Status any of:",
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
    expect(html.match(/data-chip-remove="filter:status:any_of"/g)).toHaveLength(
      2,
    );
    expect(html).toContain('aria-label="Remove Status any of: Done"');
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
    expect(live).toContain("1,234.56");
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
    expect(formatLoaded(DEFAULT_MESSAGES, 2000, 1200, "de-DE")).toBe(
      "2.000 rows loaded in 1.200 keyset pages",
    );
    const welsh = {
      ...DEFAULT_MESSAGES,
      rows: ({ count, locale }: { count: number; locale: string }) =>
        new Intl.PluralRules(locale).select(count),
    };
    expect(formatRows(welsh, 2, "cy")).toBe("two");
    expect(formatRows(welsh, 3, "cy")).toBe("few");
  });

  test("the provider's locale formats every number, and a money field's own currency wins over the provider's", () => {
    const rand = { ...TOTAL, currency: "ZAR" };
    const euro = { ...TOTAL, key: "fee", label: "Fee", currency: "EUR" };
    const html = render(
      <QueryGridMessagesProvider locale="de-DE" currency="USD">
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

  test("a nested provider inherits the currency, and with none money is a plain two-digit number", () => {
    const totals = (sum: number) => [
      { field: TOTAL, value: { sum, rows: 1, source: "live" as const } },
    ];
    const html = render(
      <QueryGridMessagesProvider currency="EUR">
        <QueryGridMessagesProvider locale="de-DE">
          <TotalFooter totals={totals(123456)} />
        </QueryGridMessagesProvider>
        <QueryGridMessagesProvider currency="JPY">
          <TotalFooter totals={totals(500)} />
        </QueryGridMessagesProvider>
      </QueryGridMessagesProvider>,
    );
    expect(html).toContain("1.234,56 €");
    expect(html).toContain("¥5");
    const plain = render(<TotalFooter totals={totals(123400)} />);
    expect(plain).toContain("1,234.00");
    expect(plain).not.toContain("$");
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
