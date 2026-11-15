import {
  listFilterFields,
  resolveFilterKind,
  type BaseGridDef,
  type RunnableQueries,
} from "@kikstart/query-grid";

const GRID_ROWS = Array.from({ length: 14 }, (_, index) => index);
const FACET_ROWS = Array.from({ length: 8 }, (_, index) => index);

interface SkeletonProps {
  def: BaseGridDef;
}

interface SkeletonFiltersProps extends SkeletonProps {
  runnable: RunnableQueries;
  fields?: string[];
}

export function SkeletonTools() {
  return (
    <div className="workspace-tools" aria-hidden="true">
      <span className="skeleton skeleton-count" />
      <span className="workspace-spacer" />
      <span className="skeleton skeleton-switch" />
    </div>
  );
}

export function SkeletonFilters({
  def,
  runnable,
  fields,
}: SkeletonFiltersProps) {
  return (
    <div className="skeleton-filters" aria-hidden="true">
      <span className="skeleton skeleton-control" data-kind="search" />
      {listFilterFields(def, runnable, fields).map((field) => (
        <span
          key={field.key}
          className="skeleton skeleton-control"
          data-kind={resolveFilterKind(field, runnable)}
        />
      ))}
      <span className="skeleton skeleton-control" data-kind="sort" />
    </div>
  );
}

export function SkeletonChips() {
  return (
    <div className="workspace-chips" aria-hidden="true">
      <span className="skeleton skeleton-control" data-kind="chip" />
      <span className="skeleton skeleton-control" data-kind="chip" />
    </div>
  );
}

function SkeletonFacets({ def }: SkeletonProps) {
  if (!def.facet) {
    return null;
  }
  return (
    <div className="skeleton-facets" aria-hidden="true">
      {FACET_ROWS.map((row) => (
        <span key={row} className="skeleton skeleton-line" />
      ))}
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      <span className="skeleton skeleton-grid-status" />
      <div className="skeleton-grid-box">
        <span className="skeleton skeleton-grid-head" />
        {GRID_ROWS.map((row) => (
          <span key={row} className="skeleton skeleton-grid-row" />
        ))}
      </div>
    </div>
  );
}

function SkeletonTotal({ def }: SkeletonProps) {
  if (!def.totals?.length) {
    return null;
  }
  return (
    <div className="workspace-total" aria-hidden="true">
      <span className="skeleton skeleton-total" />
    </div>
  );
}

export function WorkspaceSkeleton({
  def,
  runnable,
  fields,
}: SkeletonFiltersProps) {
  return (
    <>
      <SkeletonTools />
      <div
        className="workspace-body"
        data-skeleton="workspace"
        role="status"
        aria-label="The grid is on its way"
      >
        <SkeletonFilters def={def} runnable={runnable} fields={fields} />
        <SkeletonChips />
        <div className="workspace-main">
          <SkeletonFacets def={def} />
          <SkeletonGrid />
        </div>
      </div>
      <SkeletonTotal def={def} />
    </>
  );
}
