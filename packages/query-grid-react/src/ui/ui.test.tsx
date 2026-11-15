import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { GridDef } from "@kikstart/query-grid";
import { createMemorySource } from "@kikstart/query-grid/memory";

import { NO_PERSISTENCE } from "../components/column-state.ts";
import { TEST_FIELDS, TEST_ROWS } from "../components/fields.fixture.ts";
import { StaticQueryGridProvider } from "../react/query-grid-provider.tsx";
import { FilterBar, FilterSidebar, SortControl } from "./filters.tsx";

const DEF: GridDef = {
  id: "things",
  fields: TEST_FIELDS,
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
};
const source = createMemorySource(DEF, TEST_ROWS, { quick: ["name"] });

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
