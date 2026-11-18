"use client";

import { useState, type ReactNode } from "react";

import { createMemorySource } from "@kikstart/query-grid/memory";
import { QueryGridProvider } from "@kikstart/query-grid-react";
import { QueryGridMessagesProvider } from "@kikstart/query-grid-react/components";

import { listTaskRows } from "../tasks/tasks-grid-def";
import { TasksView } from "../tasks/ui/tasks-view";
import { FEATURES_GRID_DEF } from "./features-grid-def";

interface FeaturesQueryProviderProps {
  children: ReactNode;
}

export function FeaturesQueryProvider({
  children,
}: FeaturesQueryProviderProps) {
  const [source] = useState(() =>
    createMemorySource(FEATURES_GRID_DEF, listTaskRows()),
  );
  return (
    <QueryGridMessagesProvider locale="en-US" currency="USD">
      <QueryGridProvider def={FEATURES_GRID_DEF} source={source}>
        {children}
      </QueryGridProvider>
    </QueryGridMessagesProvider>
  );
}

export function FeaturesView() {
  return <TasksView def={FEATURES_GRID_DEF} />;
}
