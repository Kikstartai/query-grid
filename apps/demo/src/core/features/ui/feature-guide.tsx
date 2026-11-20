"use client";

import Link from "next/link";
import { useState } from "react";

import {
  formatProblem,
  normalizeStoredGridDef,
  type StoredDefResult,
} from "@kikstart/query-grid";
import {
  useQueryGridActions,
  useReorderOffer,
  useRowSelection,
  type RowSelection,
} from "@kikstart/query-grid-react";
import { Button } from "@ui-sdk/react/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";

import { FEATURES_ORDER_FIELD } from "../features-grid-def";
import { STORED_DEF_SAMPLES, type StoredDefSample } from "../stored-defs";

const FEATURES = [
  { value: "sort", label: "Sort columns" },
  { value: "export", label: "Export" },
  { value: "selection", label: "Selection" },
  { value: "rows", label: "Row open and actions" },
  { value: "reorder", label: "Reorder" },
  { value: "cells", label: "Cells" },
  { value: "stored", label: "Stored defs" },
];

const SERVER_SORT = "/orders?sort=item_count.desc,total.desc";
const SERVER_NARROW =
  "/orders?f.status_code.any_of=failed&f.channel.any_of=phone";

function SortPanel() {
  const { dispatch } = useQueryGridActions();
  return (
    <div className="feature-panel">
      <p>
        Click a header to sort by that column alone. Shift+click another header
        to add it as the next column, again to turn it, and once more to drop
        it; each sorted header shows its direction and its place. In memory
        every column sorts, each its own way. On Postgres a composite order runs
        at any table size only when an index declares it.
      </p>
      <Button
        data-feature-action="sort"
        onClick={() => {
          dispatch({ type: "setSort", field: "team", direction: "asc" });
          dispatch({ type: "addSort", field: "budget", direction: "desc" });
        }}
      >
        Sort by Team, then Budget
      </Button>
      <Link href={SERVER_SORT}>The same by index over 620,000 orders</Link>
    </div>
  );
}

function ExportPanel() {
  return (
    <div className="feature-panel">
      <p>
        Export CSV, in the grid&apos;s toolbar, downloads every row the filters
        leave, in the visible columns and their order: the whole result, not the
        loaded pages. This grid exports from memory. A server grid streams
        keyset pages under a row limit the server sets, and refuses a result
        over it with the limit as the reason.
      </p>
      <Link href={SERVER_NARROW}>Export a filtered server result</Link>
    </div>
  );
}

function describeSelection(selection: RowSelection): string {
  if (selection.kind === "rows") {
    return `${selection.ids.length} by id, as the host receives them`;
  }
  if (selection.kind === "matching") {
    return "everything matching, as the query the host receives";
  }
  return "nothing";
}

function SelectionPanel() {
  const selection = useRowSelection();
  return (
    <div className="feature-panel">
      <p>
        Tick rows, or the header box for every loaded row. A bar appears with
        the host&apos;s own bulk action. When more rows match than are loaded,
        the bar offers to select everything that matches, and the selection is
        then the query and never a list of ids. Selecting sends no request.
      </p>
      <output className="feature-readout" data-feature-selection>
        Selected now: {describeSelection(selection)}
      </output>
      <Link href="/orders">Select everything matching on the server grid</Link>
    </div>
  );
}

function RowsPanel() {
  return (
    <div className="feature-panel">
      <p>
        Click a task number, or press Enter on any cell, to open that row. The
        button at the end of a row, or Shift+F10 on a cell, opens its actions
        menu. Both call back to the host, which owns the dialogs and the forms:
        this page only writes what happened beside the row count.
      </p>
    </div>
  );
}

function ReorderStatus() {
  const offer = useReorderOffer();
  if (!offer) {
    return null;
  }
  if (offer.offered) {
    return (
      <output className="feature-readout" data-feature-reorder="on">
        Reorder is on.
      </output>
    );
  }
  return (
    <output className="feature-readout" data-feature-reorder="off">
      Reorder is off: {offer.reason}
    </output>
  );
}

function ReorderPanel() {
  const { dispatch } = useQueryGridActions();
  return (
    <div className="feature-panel">
      <p>
        With the grid sorted by Rank ascending and by nothing else, drag a row
        by its handle, or press Space on the handle and move it with the arrow
        keys. A filter is fine. Any other sort, or a grouping, leaves the
        handles in place but disabled, with the reason.
      </p>
      <ReorderStatus />
      <Button
        data-feature-action="reorder"
        onClick={() =>
          dispatch({
            type: "setSort",
            field: FEATURES_ORDER_FIELD,
            direction: "asc",
          })
        }
      >
        Sort by Rank
      </Button>
    </div>
  );
}

function CellsPanel() {
  return (
    <div className="feature-panel">
      <p>
        Priority is a badge toned by its value. Labels is a list that folds what
        does not fit into a count. Assignee is a link cell, here to that
        person&apos;s tasks in the in-memory demo. Blocked, Budget, Start and
        Due have no renderer at all: they format from the field&apos;s type and
        the locale.
      </p>
    </div>
  );
}

interface StoredResultProps {
  result: StoredDefResult;
}

function StoredResult({ result }: StoredResultProps) {
  if (result.ok) {
    return (
      <output className="feature-readout" data-stored-result="ok">
        Accepted: a clean def with {result.def.fields.length} fields.
      </output>
    );
  }
  return (
    <div className="feature-readout" role="status" data-stored-result="refused">
      Refused with {result.problems.length} problems:
      <ul>
        {result.problems.map((problem) => (
          <li key={formatProblem(problem.code, problem.params)}>
            <code>{formatProblem(problem.code, problem.params)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoredPanel() {
  const [sample, setSample] = useState<StoredDefSample>(STORED_DEF_SAMPLES[0]);
  const result = normalizeStoredGridDef(JSON.parse(sample.json));
  return (
    <div className="feature-panel feature-stored">
      <div className="feature-stored-intro">
        <p>
          A grid def kept as JSON in a database is untrusted input.{" "}
          <code>normalizeStoredGridDef</code> returns a fresh def holding only
          known keys, or a list of problem codes with their path. It never names
          a table and never throws.
        </p>
        <div className="feature-samples">
          {STORED_DEF_SAMPLES.map((item) => (
            <Button
              key={item.id}
              data-stored-sample={item.id}
              aria-pressed={item.id === sample.id}
              onClick={() => setSample(item)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <pre className="feature-json">{sample.json}</pre>
      <StoredResult result={result} />
    </div>
  );
}

export function FeatureGuide() {
  return (
    <Tabs className="feature-guide" defaultValue="sort" data-feature-guide>
      <TabsList aria-label="Grid features">
        {FEATURES.map((feature) => (
          <TabsTab key={feature.value} value={feature.value}>
            {feature.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel value="sort">
        <SortPanel />
      </TabsPanel>
      <TabsPanel value="export">
        <ExportPanel />
      </TabsPanel>
      <TabsPanel value="selection">
        <SelectionPanel />
      </TabsPanel>
      <TabsPanel value="rows">
        <RowsPanel />
      </TabsPanel>
      <TabsPanel value="reorder">
        <ReorderPanel />
      </TabsPanel>
      <TabsPanel value="cells">
        <CellsPanel />
      </TabsPanel>
      <TabsPanel value="stored">
        <StoredPanel />
      </TabsPanel>
    </Tabs>
  );
}
