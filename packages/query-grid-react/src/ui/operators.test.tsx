import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GridRow, QueryScope } from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { CardList } from "../components/card-list.tsx";
import { NO_PERSISTENCE } from "../components/column-state.ts";
import { FieldFilter } from "../components/field-filter.tsx";
import type { GridDef } from "../components/fields.ts";
import { QueryGridMessagesProvider } from "../components/messages.tsx";
import { StaticQueryGridProvider } from "../react/query-grid-provider.tsx";
import { FilterBar, FilterChips } from "./filters.tsx";

const DEF: GridDef = {
  id: "files",
  defaultSort: { field: "created_at", direction: "desc" },
  fields: [
    { key: "id", label: "ID", type: "id" },
    { key: "name", label: "Name", type: "text" },
    { key: "size", label: "Size", type: "integer" },
    { key: "rate", label: "Rate", type: "decimal", nullable: true },
    { key: "starred", label: "Starred", type: "boolean" },
    { key: "due", label: "Due", type: "date", nullable: true },
    { key: "created_at", label: "Created", type: "datetime" },
    { key: "folder", label: "Folder", type: "text", nullable: true },
    {
      key: "tags",
      label: "Tags",
      type: "array",
      nullable: true,
      options: [
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
      ],
    },
    { key: "labels", label: "Labels", type: "array", nullable: true },
  ],
};

const ROWS: GridRow[] = [
  {
    id: "a",
    name: "Invoice",
    size: 5,
    rate: 1.5,
    starred: true,
    due: "2026-03-01",
    created_at: "2026-03-01T10:00:00.000000Z",
    folder: "inbox",
    tags: ["red", "blue"],
    labels: ["x"],
  },
];

const source = createMemorySource(DEF, ROWS);
const noop = () => undefined;

function render(
  element: ReactElement,
  queryString = "",
  scope?: QueryScope,
): string {
  return renderToStaticMarkup(
    <StaticQueryGridProvider
      def={DEF}
      source={source}
      scope={scope}
      queryString={queryString}
      columnPersistence={NO_PERSISTENCE}
    >
      {element}
    </StaticQueryGridProvider>,
  );
}

function listChips(html: string): string[] {
  return [
    ...html.matchAll(/data-chip="[^"]*" data-kind="[^"]*"><bdi>([^<]+)/g),
  ].map((match) => match[1]);
}

describe("the controls of the new field types", () => {
  test("a boolean is a Yes / No select, an array a list, and each kind says so", () => {
    const html = render(<FilterBar />);
    expect(html).toMatch(/data-field="starred" data-kind="choice"/);
    expect(html).toMatch(/data-field="tags" data-kind="array"/);
    expect(html).toMatch(/data-field="labels" data-kind="array"/);
    expect(html).toMatch(/data-field="due" data-kind="date"/);
    expect(html).toMatch(/data-field="rate" data-kind="number"/);
    expect(html).toMatch(/data-field="name" data-kind="text"/);
    expect(html).not.toContain("(blank)");
    const starred = render(
      <FilterBar fields={["starred"]} />,
      "f.starred.any_of=true",
    );
    expect(starred).toContain(">Yes<");
  });

  test("an array field with no options looks its values up", () => {
    const html = render(<FilterBar fields={["labels"]} />, "f.labels.any_of=x");
    expect(html).toContain('data-filter="labels"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain(">x<");
  });
});

describe("an operator and its value editor", () => {
  const size = DEF.fields[2];
  const created = DEF.fields[6];
  const sizeOps = [
    { op: "between" as const },
    { op: "greater_than" as const },
    { op: "not_between" as const },
  ];
  const createdOps = [
    { op: "equals" as const },
    { op: "greater_than" as const },
    { op: "between" as const },
    { op: "not_between" as const },
    { op: "in_period" as const },
  ];

  test("a number filter shows its operator, with one value or two", () => {
    const between = renderToStaticMarkup(
      <FieldFilter
        field={size}
        ops={sizeOps}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(between).toContain('data-filter="size.op"');
    expect(between).toContain(">between<");
    expect(between).toContain('data-filter="size.min"');
    expect(between).toContain('data-filter="size.max"');
    const greater = renderToStaticMarkup(
      <FieldFilter
        field={size}
        ops={sizeOps}
        filter={{ field: "size", op: "greater_than", value: "5" }}
        onFilterChange={noop}
      />,
    );
    expect(greater).toContain(">greater than<");
    expect(greater).toContain('data-filter="size.value"');
    expect(greater).toContain('aria-label="Size value"');
    expect(greater).not.toContain('data-filter="size.max"');
    const not = renderToStaticMarkup(
      <FieldFilter
        field={size}
        ops={sizeOps}
        filter={{ field: "size", op: "not_between", min: "5", max: "9" }}
        onFilterChange={noop}
      />,
    );
    expect(not).toContain(">not between<");
    expect(not).toContain('data-filter="size.max"');
  });

  test("with no filter the control opens on the field kind's usual operator when it is offered", () => {
    const held = renderToStaticMarkup(
      <FieldFilter
        field={size}
        ops={[
          { op: "between", disabled: true, reason: "Narrow first." },
          { op: "greater_than" },
        ]}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(held).toContain(">greater than<");
    expect(held).toContain('data-filter="size.value"');
  });

  test("a date filter names its operator in the dates' words and picks one date or two", () => {
    const on = renderToStaticMarkup(
      <FieldFilter
        field={created}
        ops={createdOps}
        filter={{ field: "created_at", op: "equals", value: "2026-03-03" }}
        onFilterChange={noop}
      />,
    );
    expect(on).toContain(">on<");
    expect(on).toContain('data-filter="created_at.value"');
    expect(on).toContain('aria-label="Pick a Created date"');
    expect(on).not.toContain('aria-label="Pick Created dates"');
    const after = renderToStaticMarkup(
      <FieldFilter
        field={created}
        ops={createdOps}
        filter={{
          field: "created_at",
          op: "greater_than",
          value: "2026-03-03",
        }}
        onFilterChange={noop}
      />,
    );
    expect(after).toContain(">after<");
    const not = renderToStaticMarkup(
      <FieldFilter
        field={created}
        ops={createdOps}
        filter={{
          field: "created_at",
          op: "not_between",
          min: "2026-03-03",
          max: "2026-03-09",
        }}
        onFilterChange={noop}
      />,
    );
    expect(not).toContain(">not between<");
    expect(not).toContain('aria-label="Pick Created dates"');
    const idle = renderToStaticMarkup(
      <FieldFilter
        field={created}
        ops={createdOps}
        filter={null}
        onFilterChange={noop}
      />,
    );
    expect(idle).toContain(">in period<");
    expect(idle).toContain('data-filter="created_at.preset"');
  });

  test("an operator the data cannot answer keeps the filter it already holds", () => {
    const held = renderToStaticMarkup(
      <FieldFilter
        field={size}
        ops={[
          { op: "between" },
          {
            op: "not_between",
            disabled: true,
            reason: "Narrow by Status first: 620,000+ rows.",
          },
        ]}
        filter={{ field: "size", op: "not_between", min: "5", max: "9" }}
        onFilterChange={noop}
      />,
    );
    expect(held).toContain(">not between<");
    expect(held).toMatch(/data-filter="size\.max"(?![^>]*disabled)/);
  });

  test("the bound filter reads the field's first filter, in the query's order", () => {
    const html = render(
      <FilterBar fields={["size"]} />,
      "f.size.less_than=9&f.size.greater_than=5",
    );
    expect(html).toContain(">greater than<");
    expect(html).toContain('data-filter="size.value"');
    expect(html).toContain('value="5"');
  });
});

describe("the chips of the new filters", () => {
  test("each says its operator in the messages' words", () => {
    const html = render(
      <FilterChips />,
      [
        "f.size.greater_than=5",
        "f.size.not_equals=9",
        "f.rate.between=1.5..2.5",
        "f.rate.blank=",
        "f.due.less_than=2026-03-01",
        "f.created_at.not_between=2026-03-03..2026-03-09",
        "f.name.starts_with=inv",
        "f.name.not_contains=draft",
        "f.folder.not_equals=inbox",
        "f.starred.any_of=false",
        "f.tags.all_of=red",
      ].join("&"),
    );
    expect(listChips(html)).toEqual([
      "Name not contains “draft”",
      "Name starts with “inv”",
      "Size not equals 9",
      "Size greater than 5",
      "Rate between 1.5 and 2.5",
      "Rate blank",
      "Starred any of:",
      "Due before 2026-03-01",
      "Created not between 2026-03-03 and 2026-03-09",
      "Folder not equals “inbox”",
      "Tags all of:",
      "Sort: Created ↓",
    ]);
    expect(html).toContain(">No<");
    expect(html).toContain(">Red<");
  });

  test("the words are the host's to change", () => {
    const html = renderToStaticMarkup(
      <QueryGridMessagesProvider
        messages={{
          ops: { number: { greater_than: "over" } },
          chipText: ({ value }) => `«${value}»`,
          booleanTrue: "On",
        }}
      >
        <StaticQueryGridProvider
          def={DEF}
          source={source}
          queryString="f.size.greater_than=5&f.name.starts_with=inv&f.starred.any_of=true&f.rate.not_equals=2"
          columnPersistence={NO_PERSISTENCE}
        >
          <FilterChips />
        </StaticQueryGridProvider>
      </QueryGridMessagesProvider>,
    );
    expect(listChips(html)).toEqual([
      "Name starts with «inv»",
      "Size over 5",
      "Rate not equals 2",
      "Starred any of:",
      "Sort: Created ↓",
    ]);
    expect(html).toContain(">On<");
  });
});

describe("the text filter, bound", () => {
  test("shows the field's first text filter with its operator", () => {
    const html = render(
      <FilterBar fields={["name", "folder"]} />,
      "f.name.contains=inv&f.folder.blank=",
    );
    expect(html).toContain('aria-label="Name contains"');
    expect(html).toContain('value="inv"');
    expect(html).toMatch(/data-filter="folder\.op"[^>]*>.*?>blank</s);
    expect(html).not.toContain('data-filter="folder.value"');
  });
});

describe("a scope on the provider", () => {
  const scope: QueryScope = {
    filters: [
      { field: "folder", op: "equals", value: "inbox" },
      { field: "tags", op: "any_of", values: ["red"] },
    ],
  };

  test("is no chip, no control and no URL key", () => {
    const html = render(
      <>
        <FilterBar />
        <FilterChips />
      </>,
      "f.starred.any_of=true&f.folder.equals=other&f.tags.any_of=blue",
      scope,
    );
    expect(listChips(html)).toEqual(["Starred any of:", "Sort: Created ↓"]);
    expect(html).not.toContain('data-field="folder"');
    expect(html).not.toContain('data-field="tags"');
    expect(html).toContain('data-field="labels"');
    expect(html).not.toContain('data-field="combine"');
  });

  test("leaves the same grid untouched without one", () => {
    const html = render(<FilterBar />, "f.folder.equals=other");
    expect(html).toContain('data-field="folder"');
    expect(html).toContain('data-field="combine"');
  });
});

describe("a cell of the new field types", () => {
  test("a boolean reads in the messages' words and an array as a list", () => {
    const html = renderToStaticMarkup(
      <CardList
        fields={DEF.fields}
        rows={ROWS}
        hasNext={false}
        loading={false}
        onEndReached={noop}
        titleField="name"
        badgeField="starred"
      />,
    );
    expect(html).toContain("<bdi>Yes</bdi>");
    expect(html).toContain("<bdi>Red, Blue</bdi>");
    expect(html).toContain("<bdi>1.5</bdi>");
    expect(html).toContain("Mar 1, 2026");
  });
});
