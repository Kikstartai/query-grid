"use client";

import { useState, type ReactNode } from "react";

import { createMemorySource } from "@kikstart/query-grid/memory";
import { QueryGridProvider } from "@kikstart/query-grid-react";

import {
  listTaskRows,
  TASK_QUICK_FIELDS,
  TASK_TRANSITIONS,
  TASKS_GRID_DEF,
} from "./tasks-grid-def";

interface TasksQueryProviderProps {
  children: ReactNode;
}

export function TasksQueryProvider({ children }: TasksQueryProviderProps) {
  const [source] = useState(() =>
    createMemorySource(TASKS_GRID_DEF, listTaskRows(), {
      quick: TASK_QUICK_FIELDS,
      transitions: TASK_TRANSITIONS,
    }),
  );
  return (
    <QueryGridProvider def={TASKS_GRID_DEF} source={source}>
      {children}
    </QueryGridProvider>
  );
}
