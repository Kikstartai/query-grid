"use client";

import { Button } from "@ui-sdk/react/button";

import type { ControlState } from "./fields.ts";
import { DownloadIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";

export interface ExportButtonProps extends ControlState {
  onExport: () => void;
  exporting?: boolean;
  error?: string | null;
}

function ExportError({ error }: Pick<ExportButtonProps, "error">) {
  if (!error) {
    return null;
  }
  return (
    <bdi className="qg-export-error" role="alert" data-export-error>
      {error}
    </bdi>
  );
}

export function ExportButton({
  onExport,
  exporting = false,
  error,
  disabled = false,
  reason,
}: ExportButtonProps) {
  const messages = useMessages();
  return (
    <span
      className="qg-export"
      data-part="export"
      data-unavailable={disabled ? "" : undefined}
      title={reason ?? undefined}
    >
      <Button
        data-export
        aria-busy={exporting || undefined}
        disabled={disabled || exporting}
        focusableWhenDisabled
        onClick={onExport}
      >
        <DownloadIcon />
        <bdi>{exporting ? messages.exporting : messages.exportCsv}</bdi>
      </Button>
      <ExportError error={error} />
    </span>
  );
}
