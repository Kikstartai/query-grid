import { Suspense } from "react";

import { gridDefCapabilities } from "@kikstart/query-grid";

import { AtRequest } from "@/lib/at-request";
import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import { ORDERS_GRID_DEF } from "../orders-grid-def";
import { OrdersQueryProvider } from "../orders-provider";
import { OrdersView } from "./orders-view";

interface OrdersWorkspaceProps {
  title: string;
  dir?: "rtl";
  locale?: string;
}

export function OrdersWorkspace({ title, dir, locale }: OrdersWorkspaceProps) {
  return (
    <div className="workspace" dir={dir} data-dir={dir}>
      <header className="workspace-head">
        <SiteBrand />
        <h1>{title}</h1>
      </header>
      <Suspense
        fallback={
          <WorkspaceSkeleton
            def={ORDERS_GRID_DEF}
            capabilities={gridDefCapabilities(ORDERS_GRID_DEF)}
          />
        }
      >
        <AtRequest>
          <OrdersQueryProvider locale={locale}>
            <WorkspaceParts>
              <OrdersView />
            </WorkspaceParts>
          </OrdersQueryProvider>
        </AtRequest>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
