import {
  listFilterFields,
  resolveFilterKind,
  type GridDef,
} from "@kikstart/query-grid";

const GRID_ROWS = Array.from({ length: 14 }, (_, index) => index);
const FACET_ROWS = Array.from({ length: 8 }, (_, index) => index);

interface SkeletonProps {
  def: GridDef;
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

export function SkeletonFilters({ def }: SkeletonProps) {
  return (
    <div className="skeleton-filters" aria-hidden="true">
      <span className="skeleton skeleton-control" data-kind="quick" />
      {listFilterFields(def).map((field) => (
        <span
          key={field.key}
          className="skeleton skeleton-control"
          data-kind={resolveFilterKind(field)}
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
  if (!def.total) {
    return null;
  }
  return (
    <div className="workspace-total" aria-hidden="true">
      <span className="skeleton skeleton-total" />
    </div>
  );
}

export function WorkspaceSkeleton({ def }: SkeletonProps) {
  return (
    <>
      <SkeletonTools />
      <div
        className="workspace-body"
        data-skeleton="workspace"
        role="status"
        aria-label="The grid is on its way"
      >
        <SkeletonFilters def={def} />
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
