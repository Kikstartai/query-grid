"use client";

import { useState, type ReactNode } from "react";

import { createMemorySource } from "@kikstart/query-grid/memory";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { QueryGridMessagesProvider } from "@kikstart/query-grid-react/components";

import { listTaskRows, TASKS_GRID_DEF } from "./tasks-grid-def";

interface TasksQueryProviderProps {
  children: ReactNode;
}

export function TasksQueryProvider({ children }: TasksQueryProviderProps) {
  const [source] = useState(() =>
    createMemorySource(TASKS_GRID_DEF, listTaskRows()),
  );
  return (
    <QueryGridMessagesProvider locale="en-US" currency="USD">
      <QueryGridProvider def={TASKS_GRID_DEF} source={source}>
        {children}
      </QueryGridProvider>
    </QueryGridMessagesProvider>
  );
}
