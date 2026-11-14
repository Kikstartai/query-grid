import type { ReactNode } from "react";

import type { ControlState } from "./fields.ts";

export interface FieldFrameProps extends ControlState {
  name: string;
  kind: "equals" | "range" | "sort" | "quick";
  label: string;
  children: ReactNode;
}

function FieldReason({
  reason,
  showReason,
}: Pick<ControlState, "reason" | "showReason">) {
  if (!showReason || !reason) {
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
  showReason,
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
      <FieldReason reason={reason} showReason={showReason} />
    </div>
  );
}
