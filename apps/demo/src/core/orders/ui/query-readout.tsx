"use client";

import { useQueryState } from "@kikstart/query-grid-react";

export function QueryReadout() {
  const query = useQueryState();
  return (
    <pre className="part-readout" data-part="query-readout">
      {JSON.stringify(query)}
    </pre>
  );
}
