"use client";

import type { ReactNode } from "react";

import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { QueryGridMessagesProvider } from "@kikstart/query-grid-react/components";

import { ORDERS_API, ORDERS_GRID_DEF } from "./orders-grid-def";

const ORDERS_LOCALE = "en-ZA";
const ORDERS_SOURCE = createHttpSource(ORDERS_GRID_DEF, ORDERS_API);

interface OrdersQueryProviderProps {
  children: ReactNode;
}

export function OrdersQueryProvider({ children }: OrdersQueryProviderProps) {
  return (
    <QueryGridMessagesProvider locale={ORDERS_LOCALE} currency="ZAR">
      <QueryGridProvider def={ORDERS_GRID_DEF} source={ORDERS_SOURCE}>
        {children}
      </QueryGridProvider>
    </QueryGridMessagesProvider>
  );
}
