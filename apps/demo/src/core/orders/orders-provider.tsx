"use client";

import type { ReactNode } from "react";

import { createHttpSource } from "@kikstart/query-grid/http";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { QueryGridMessagesProvider } from "@kikstart/query-grid-react/components";

import { ORDERS_API, ORDERS_GRID_DEF, ORDERS_LOCALE } from "./orders-grid-def";

const ORDERS_SOURCE = createHttpSource(ORDERS_GRID_DEF, ORDERS_API);

interface OrdersQueryProviderProps {
  locale?: string;
  children: ReactNode;
}

export function OrdersQueryProvider({
  locale = ORDERS_LOCALE,
  children,
}: OrdersQueryProviderProps) {
  return (
    <QueryGridMessagesProvider locale={locale}>
      <QueryGridProvider def={ORDERS_GRID_DEF} source={ORDERS_SOURCE}>
        {children}
      </QueryGridProvider>
    </QueryGridMessagesProvider>
  );
}
