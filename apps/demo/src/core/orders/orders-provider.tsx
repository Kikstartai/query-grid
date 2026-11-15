"use client";

import type { ReactNode } from "react";

import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";

import { ORDERS_API, ORDERS_GRID_DEF } from "./orders-grid-def";

const ORDERS_SOURCE = createHttpSource(ORDERS_GRID_DEF, ORDERS_API);

interface OrdersQueryProviderProps {
  children: ReactNode;
}

export function OrdersQueryProvider({ children }: OrdersQueryProviderProps) {
  return (
    <QueryGridProvider def={ORDERS_GRID_DEF} source={ORDERS_SOURCE}>
      {children}
    </QueryGridProvider>
  );
}
