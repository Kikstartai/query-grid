"use client";

import { createContext, use, type ReactNode } from "react";

import type { FieldKind } from "@kikstart/query-grid";

import type { ControlState } from "./fields.ts";

export interface FieldFrameProps extends ControlState {
  name: string;
  kind: FieldKind | "sort" | "search" | "combine" | "group";
  label: string;
  children: ReactNode;
}

export const ReasonDisplayContext = createContext(false);

function FieldReason({ reason }: Pick<ControlState, "reason">) {
  const shown = use(ReasonDisplayContext);
  if (!shown || !reason) {
    return null;
  }
  return (
    <p className="qg-field-reason" data-field-reason>
      <bdi>{reason}</bdi>
    </p>
  );
}

export function FieldFrame({
  name,
  kind,
  label,
  disabled,
  reason,
  children,
}: FieldFrameProps) {
  return (
    <div
      className="qg-field"
      data-field={name}
      data-kind={kind}
      data-unavailable={disabled ? "" : undefined}
      title={reason ?? undefined}
    >
      <span className="qg-field-label">{label}</span>
      <div className="qg-field-control">{children}</div>
      <FieldReason reason={reason} />
    </div>
  );
}
