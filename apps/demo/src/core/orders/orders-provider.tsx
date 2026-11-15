"use client";

import type { ReactNode } from "react";

import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";

import { ORDERS_API, ORDERS_CAPABILITIES } from "./orders-def";
import { ORDERS_GRID } from "./orders-grid";

const ORDERS_SOURCE = createHttpSource(
  ORDERS_GRID,
  ORDERS_API,
  ORDERS_CAPABILITIES,
);

interface OrdersQueryProviderProps {
  children: ReactNode;
}

export function OrdersQueryProvider({ children }: OrdersQueryProviderProps) {
  return (
    <QueryGridProvider def={ORDERS_GRID} source={ORDERS_SOURCE}>
      {children}
    </QueryGridProvider>
  );
}
