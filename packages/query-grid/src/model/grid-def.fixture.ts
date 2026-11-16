import type { DataSource } from "./data-source.ts";
import type { DataSourceCapabilities, BaseGridDef } from "./field-types.ts";
import type { IndexDef } from "./indexes.ts";

export const TEST_SEARCH_FIELDS = ["name", "number"];

export const TEST_INDEXES: IndexDef[] = [
  { equals: [], sort: "created_at", range: true },
  { equals: [], sort: "total", range: true },
  { equals: ["status"], sort: "created_at" },
  { equals: ["status"], sort: "total", range: true },
  { equals: ["region"], sort: "created_at" },
];

export const TEST_DEF: BaseGridDef = {
  id: "things",
  defaultSort: { field: "created_at", direction: "desc" },
  facet: { field: "status" },
  totals: ["total", "number"],
  search: TEST_SEARCH_FIELDS,
  fields: [
    { key: "id", label: "ID", type: "id" },
    { key: "number", label: "Number", type: "integer" },
    {
      key: "created_at",
      label: "Created",
      type: "datetime",
    },
    { key: "total", label: "Total", type: "money" },
    {
      key: "status",
      label: "Status",
      type: "enum",
      options: [
        { value: "open", label: "Open" },
        { value: "done", label: "Done" },
      ],
    },
    {
      key: "region",
      label: "Region",
      type: "enum",
      options: [
        { value: "north", label: "North" },
        { value: "south", label: "South" },
      ],
    },
    { key: "name", label: "Name", type: "text" },
    {
      key: "note",
      label: "Note",
      type: "text",
      nullable: true,
    },
  ],
};

export const UNTIERED = {
  narrowLimited: false,
  matchAny: false,
  isNarrowed: () => false,
  narrowBasis: () => "",
  containsFields: [],
  groupFields: [],
};

export function createTestSource(
  capabilities: DataSourceCapabilities,
  overrides: Partial<DataSource> = {},
): DataSource {
  const none = async () => [];
  return {
    capabilities,
    fetchPage: async () => ({ rows: [], nextCursor: null, hasNext: false }),
    fetchCount: async () => ({ count: 0, capped: false, source: "exact" }),
    fetchTotals: none,
    fetchFacets: none,
    fetchOptions: none,
    fetchGroups: async () => ({ groups: [], source: "live", truncated: false }),
    fetchNarrowed: async () => null,
    fetchLimits: async () => null,
    fetchTransitions: none,
    changeFacetValue: async (id) => ({ id }),
    ...overrides,
  };
}

export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
