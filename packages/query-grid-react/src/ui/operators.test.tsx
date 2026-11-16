import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GridRow, QueryScope } from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { CardList } from "../components/card-list.tsx";
import { NO_PERSISTENCE } from "../components/column-state.ts";
import { RangeFilter } from "../components/field-filter.tsx";
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
  test("a boolean is a Yes / No select, an array an overlap, and each kind says so", () => {
    const html = render(<FilterBar />);
    expect(html).toMatch(/data-field="starred" data-kind="equals"/);
    expect(html).toMatch(/data-field="tags" data-kind="overlap"/);
    expect(html).toMatch(/data-field="labels" data-kind="overlap"/);
    expect(html).toMatch(/data-field="due" data-kind="range"/);
    expect(html).toMatch(/data-field="rate" data-kind="range"/);
    expect(html).not.toContain("(empty)</");
    const starred = render(
      <FilterBar fields={["starred"]} />,
      "f.starred=true",
    );
    expect(starred).toContain(">Yes<");
  });

  test("an array field with no options looks its values up", () => {
    const html = render(<FilterBar fields={["labels"]} />, "o.labels=x");
    expect(html).toContain('data-filter="labels"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain(">x<");
  });
});

describe("a range and its operator", () => {
  const size = DEF.fields[2];
  const created = DEF.fields[6];

  test("a number range shows the operator the range says, with one value or two", () => {
    const between = renderToStaticMarkup(
      <RangeFilter field={size} range={null} onRangeChange={noop} />,
    );
    expect(between).toContain('data-filter="size.op"');
    expect(between).toContain(">between<");
    expect(between).toContain('data-filter="size.min"');
    expect(between).toContain('data-filter="size.max"');
    const greater = renderToStaticMarkup(
      <RangeFilter
        field={size}
        range={{ min: "5", max: null, minExclusive: true }}
        onRangeChange={noop}
      />,
    );
    expect(greater).toContain(">&gt;<");
    expect(greater).toContain('data-filter="size.value"');
    expect(greater).toContain('aria-label="Size value"');
    expect(greater).not.toContain('data-filter="size.max"');
    const not = renderToStaticMarkup(
      <RangeFilter
        field={size}
        range={{ min: "5", max: "9", exclude: true }}
        onRangeChange={noop}
      />,
    );
    expect(not).toContain(">not between<");
    expect(not).toContain('data-filter="size.max"');
  });

  test("a half-open range stays a between, since that is the control's default", () => {
    const html = renderToStaticMarkup(
      <RangeFilter
        field={size}
        range={{ min: "5", max: null }}
        onRangeChange={noop}
      />,
    );
    expect(html).toContain(">between<");
    expect(html).toContain('data-filter="size.max"');
  });

  test("a date range names its operator in the period select and picks one date or two", () => {
    const on = renderToStaticMarkup(
      <RangeFilter
        field={created}
        range={{
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-03T23:59:59.999999Z",
        }}
        onRangeChange={noop}
      />,
    );
    expect(on).toContain("On…");
    expect(on).toContain('aria-label="Pick a Created date"');
    expect(on).not.toContain('aria-label="Pick Created dates"');
    const after = renderToStaticMarkup(
      <RangeFilter
        field={created}
        range={{
          min: "2026-03-03T23:59:59.999999Z",
          max: null,
          minExclusive: true,
        }}
        onRangeChange={noop}
      />,
    );
    expect(after).toContain("After…");
    const not = renderToStaticMarkup(
      <RangeFilter
        field={created}
        range={{
          min: "2026-03-03T00:00:00.000000Z",
          max: "2026-03-09T23:59:59.999999Z",
          exclude: true,
        }}
        onRangeChange={noop}
      />,
    );
    expect(not).toContain("Not between…");
    expect(not).toContain('aria-label="Pick Created dates"');
  });

  test("the bound filter reads the field's first range from the URL", () => {
    const html = render(
      <FilterBar fields={["size"]} />,
      "r.size=(5..&r.size=!9..9",
    );
    expect(html).toContain(">&gt;<");
    expect(html).toContain('data-filter="size.value"');
  });
});

describe("the chips of the new filters", () => {
  test("each says its operator in the messages' words", () => {
    const html = render(
      <FilterChips />,
      [
        "r.size=(5..",
        "r.size=!9..9",
        "r.rate=1.5..2.5",
        "r.due=..2026-03-01)",
        "r.created_at=!2026-03-03T00:00:00.000000Z..2026-03-09T23:59:59.999999Z",
        "sw.name=inv",
        "nc.name=draft",
        "ne.folder=inbox",
        "f.starred=false",
        "o.tags=red",
      ].join("&"),
    );
    expect(listChips(html)).toEqual([
      "Starred:",
      "Tags has:",
      "Size &gt; 5",
      "Size ≠ 9",
      "Rate: 1.5 – 2.5",
      "Due &lt; 2026-03-01",
      "Created: not 2026-03-03 – 2026-03-09",
      "Name does not contain “draft”",
      "Name starts with “inv”",
      "Folder is not “inbox”",
      "Sort: Created ↓",
    ]);
    expect(html).toContain(">No<");
    expect(html).toContain(">Red<");
  });

  test("the words are the host's to change", () => {
    const html = renderToStaticMarkup(
      <QueryGridMessagesProvider
        messages={{
          chipRangeOps: { gt: ({ label, min }) => `${label} over ${min}` },
          chipTexts: {
            starts_with: ({ label, value }) => `${label} begins ${value}`,
          },
          booleanTrue: "On",
        }}
      >
        <StaticQueryGridProvider
          def={DEF}
          source={source}
          queryString="r.size=(5..&sw.name=inv&f.starred=true&r.rate=!2..2"
          columnPersistence={NO_PERSISTENCE}
        >
          <FilterChips />
        </StaticQueryGridProvider>
      </QueryGridMessagesProvider>,
    );
    expect(listChips(html)).toEqual([
      "Starred:",
      "Size over 5",
      "Rate ≠ 2",
      "Name begins inv",
      "Sort: Created ↓",
    ]);
    expect(html).toContain(">On<");
  });
});

describe("the text filter, bound", () => {
  test("shows a row for each filter in the URL and one more to add", () => {
    const html = render(
      <FilterBar fields={["name", "folder"]} />,
      "c.name=inv&nc.name=draft",
    );
    expect(html.match(/data-text-row=/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Name contains"');
    expect(html).toContain('aria-label="Name does not contain"');
  });
});

describe("a scope on the provider", () => {
  const scope: QueryScope = {
    equals: { folder: ["inbox"] },
    overlaps: { tags: ["red"] },
  };

  test("is no chip, no control and no URL key", () => {
    const html = render(
      <>
        <FilterBar />
        <FilterChips />
      </>,
      "f.starred=true&f.folder=other&o.tags=blue",
      scope,
    );
    expect(listChips(html)).toEqual(["Starred:", "Sort: Created ↓"]);
    expect(html).not.toContain('data-field="folder"');
    expect(html).not.toContain('data-field="tags"');
    expect(html).toContain('data-field="labels"');
    expect(html).not.toContain('data-field="match"');
  });

  test("leaves the same grid untouched without one", () => {
    const html = render(<FilterBar />, "f.folder=other");
    expect(html).toContain('data-field="folder"');
    expect(html).toContain('data-field="match"');
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
