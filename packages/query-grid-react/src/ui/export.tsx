"use client";

import { useState } from "react";

import { CSV_TYPE, toProblem, type Problem } from "@kikstart/query-grid";

import { ExportButton as BaseExportButton } from "../components/export-button.tsx";
import {
  formatProblemMessage,
  formatRows,
  useLocale,
  useMessages,
} from "../components/messages.tsx";
import { saveTextFile } from "../react/download.ts";
import {
  useQueryGridActions,
  useQueryGridMeta,
} from "../react/query-grid-context.tsx";
import {
  useColumns,
  useCountState,
  useGridLimits,
} from "../react/query-grid-hooks.ts";

export interface ExportButtonProps {
  fileName?: string;
  columns?: string[];
}

interface ExportState {
  exporting: boolean;
  problem: Problem | null;
}

const IDLE: ExportState = { exporting: false, problem: null };

function useExportReason(): string | null {
  const messages = useMessages();
  const locale = useLocale();
  const limits = useGridLimits();
  const { result } = useCountState();
  if (!limits || !result || result.capped) {
    return null;
  }
  if (result.count <= limits.exportLimit) {
    return null;
  }
  return messages.exportOverLimit({
    limit: formatRows(messages, limits.exportLimit, locale),
    rows: formatRows(messages, result.count, locale),
  });
}

export function ExportButton({ fileName, columns }: ExportButtonProps) {
  const { def } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const { fetchExport } = useQueryGridActions();
  const { layout } = useColumns();
  const reason = useExportReason();
  const [state, setState] = useState(IDLE);
  const run = async () => {
    setState({ exporting: true, problem: null });
    try {
      const text = await fetchExport(
        columns ?? layout.map((column) => column.field.key),
      );
      saveTextFile(fileName ?? `${def.id}.csv`, CSV_TYPE, text);
      setState(IDLE);
    } catch (error) {
      setState({ exporting: false, problem: toProblem(error) });
    }
  };
  return (
    <BaseExportButton
      onExport={() => void run()}
      exporting={state.exporting}
      error={
        state.problem
          ? formatProblemMessage(messages, state.problem, locale)
          : null
      }
      disabled={reason !== null}
      reason={reason}
    />
  );
}
