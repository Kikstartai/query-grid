const FILTER_WIDTHS = [220, 150, 150, 150, 200, 260, 220, 180];
const GRID_ROWS = Array.from({ length: 14 }, (_, index) => index);
const FACET_ROWS = Array.from({ length: 8 }, (_, index) => index);

export function SkeletonTools() {
  return (
    <div className="workspace-tools" aria-hidden="true">
      <span className="skeleton skeleton-count" />
      <span className="workspace-spacer" />
      <span className="skeleton skeleton-switch" />
    </div>
  );
}

export function SkeletonFilters() {
  return (
    <div className="skeleton-filters" aria-hidden="true">
      {FILTER_WIDTHS.map((width, index) => (
        <span
          key={index}
          className="skeleton skeleton-control"
          style={{ width }}
        />
      ))}
    </div>
  );
}

export function SkeletonChips() {
  return (
    <div className="workspace-chips" aria-hidden="true">
      <span className="skeleton skeleton-control" style={{ width: 110 }} />
      <span className="skeleton skeleton-control" style={{ width: 150 }} />
    </div>
  );
}

export function SkeletonFacets() {
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

export function SkeletonTotal() {
  return (
    <div className="workspace-total" aria-hidden="true">
      <span className="skeleton skeleton-line" style={{ width: 240 }} />
    </div>
  );
}
