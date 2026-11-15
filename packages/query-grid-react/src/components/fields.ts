import type { ReactNode } from "react";

import type {
  FieldDef,
  GridDef,
  GridRow,
  LoadStatus,
} from "@kikstart/query-grid";

export interface ClientFieldDef extends FieldDef {
  cell?: (value: string | number | null, row: GridRow) => ReactNode;
}

export type ClientGridDef = GridDef<ClientFieldDef>;

export interface ControlOption {
  value: string;
  label: string;
  disabled?: boolean;
  reason?: string | null;
}

export interface ControlState {
  disabled?: boolean;
  reason?: string | null;
}

export interface RowWindow {
  rows: GridRow[];
  hasNext: boolean;
  onEndReached: () => void;
  loading: boolean;
  error?: string | null;
  pages?: number;
}

export type { LoadStatus };
