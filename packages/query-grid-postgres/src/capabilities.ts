import type { Capabilities } from "@kikstart/query-grid";

import {
  isFacetOnlyQuery,
  listQuickFields,
  listSortFields,
  matchShape,
} from "./shapes.ts";
import type { QueryShape } from "./storage.ts";

export interface CapabilityOptions {
  facetField?: string;
}

export function capabilities(
  shapes: QueryShape[],
  options: CapabilityOptions = {},
): Capabilities {
  return {
    mode: "server",
    isAnswerable: (query) => matchShape(shapes, query) !== null,
    sortFields: listSortFields(shapes),
    quickFields: listQuickFields(shapes),
    isFacetCountShown: (query) => isFacetOnlyQuery(options.facetField, query),
  };
}
