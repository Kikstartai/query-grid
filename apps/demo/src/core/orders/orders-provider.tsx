"use client";

import type { ReactNode } from "react";

import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";

import { ORDERS_API } from "./orders-fields";
import { ORDERS_CAPABILITIES, ORDERS_GRID } from "./orders-grid-def";

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
