import { Suspense } from "react";

import { gridDefRunnable } from "@kikstart/query-grid";

import { ByKikstart, SiteBrand } from "@/lib/site-brand";
import { WorkspaceParts } from "@/lib/workspace-parts";
import { WorkspaceSkeleton } from "@/lib/workspace-skeleton";

import {
  ORDER_BAR_FIELDS,
  ORDER_CONTAINS_FIELDS,
  ORDERS_GRID_DEF,
} from "../orders-grid-def";
import { OrdersQueryProvider } from "../orders-provider";
import { OrdersView } from "./orders-view";

interface OrdersWorkspaceProps {
  title: string;
  dir?: "rtl";
}

export function OrdersWorkspace({ title, dir }: OrdersWorkspaceProps) {
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
            runnable={gridDefRunnable(ORDERS_GRID_DEF)}
            fields={ORDER_BAR_FIELDS}
            contains={ORDER_CONTAINS_FIELDS}
          />
        }
      >
        <OrdersQueryProvider>
          <WorkspaceParts
            barFields={ORDER_BAR_FIELDS}
            containsFields={ORDER_CONTAINS_FIELDS}
          >
            <OrdersView />
          </WorkspaceParts>
        </OrdersQueryProvider>
      </Suspense>
      <footer className="workspace-foot">
        <ByKikstart />
      </footer>
    </div>
  );
}
