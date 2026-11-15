import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMemorySource } from "@kikstart/query-grid/memory";

import { NO_PERSISTENCE } from "../components/column-state.ts";
import { TEST_GRID_DEF, TEST_ROWS } from "../components/fields.fixture.ts";
import { StaticQueryGridProvider } from "../react/query-grid-provider.tsx";
import { ColumnsMenu, DataGrid } from "./data-grid.tsx";
import { FilterBar, FilterSidebar, SortControl } from "./filters.tsx";
import { FacetPanel } from "./summaries.tsx";

const DEF = TEST_GRID_DEF;
const source = createMemorySource(DEF, TEST_ROWS);

function render(element: ReactElement): string {
  return renderToStaticMarkup(
    <StaticQueryGridProvider
      def={DEF}
      source={source}
      search=""
      columnPersistence={NO_PERSISTENCE}
    >
      {element}
    </StaticQueryGridProvider>,
  );
}

describe("the bound DataGrid", () => {
  test("the default composition has the toolbar and the body", () => {
    const html = render(<DataGrid />);
    expect(html).toContain('data-part="grid-status"');
    expect(html).toContain('data-part="grid-scroller"');
  });

  test("its parts compose, with the columns menu mounted outside the grid", () => {
    const html = render(
      <>
        <ColumnsMenu />
        <DataGrid.Root>
          <DataGrid.Body />
        </DataGrid.Root>
      </>,
    );
    expect(html).not.toContain("qg-grid-toolbar");
    expect(html).toContain('data-part="grid-scroller"');
    expect(html.match(/columns-menu-trigger/g)).toHaveLength(1);
  });
});

describe("the bound FacetPanel", () => {
  test("it shows no count before the facet counts have loaded", () => {
    const html = render(<FacetPanel />);
    expect(html).toContain('data-facet="open"');
    expect(html.match(/data-facet-count="true"><\/bdi>/g)).toHaveLength(3);
  });
});

describe("the bound filter containers", () => {
  test("FilterBar fills itself with every control by default", () => {
    const html = render(<FilterBar />);
    expect(html).toContain('data-field="quick"');
    expect(html).toContain('data-field="status"');
    expect(html).toContain('data-field="sort"');
  });

  test("FilterBar renders the children it is given and nothing else", () => {
    const html = render(
      <FilterBar>
        <SortControl />
      </FilterBar>,
    );
    expect(html).toContain('data-field="sort"');
    expect(html).not.toContain('data-field="quick"');
    expect(html).not.toContain('data-field="status"');
  });

  test("fields picks the filters a container shows, in that order", () => {
    const html = render(<FilterBar fields={["region", "status"]} />);
    const shown = [...html.matchAll(/data-field="([a-z_]+)"/g)].map(
      (match) => match[1],
    );
    expect(shown).toEqual(["quick", "region", "status", "sort"]);
  });

  test("without fields a client grid shows a filter for every field", () => {
    const html = render(<FilterBar />);
    for (const field of DEF.fields) {
      expect(html).toContain(`data-field="${field.key}"`);
    }
  });

  test("FilterSidebar takes children the same way", () => {
    expect(
      render(
        <FilterSidebar>
          <SortControl />
        </FilterSidebar>,
      ),
    ).toContain("data-part");
  });
});
