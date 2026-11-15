import { SiteBrand } from "@/lib/site-brand";

import { CatalogGrid } from "./catalog-grid";

export function CatalogWorkspace() {
  return (
    <div className="workspace" data-source="props">
      <header className="workspace-head">
        <SiteBrand />
        <h1>Base components</h1>
      </header>
      <p className="workspace-note">
        The same components with no provider, no query state and no server:
        sixty rows in a constant, filtered and sorted by this page&apos;s own{" "}
        <code>useState</code>, passed in as plain props.
      </p>
      <CatalogGrid />
    </div>
  );
}
