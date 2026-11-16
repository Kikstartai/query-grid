"use client";

import { useState } from "react";

import {
  createBoard,
  formatValue,
  getFacetField,
  getLaneQueries,
  toProblem,
  type QueryState,
} from "@kikstart/query-grid";

import {
  formatProblemMessage,
  useLocale,
  useMessages,
} from "../components/messages.tsx";
import {
  StatusBoard as BaseStatusBoard,
  type BoardMoveDetails,
} from "../components/status-board.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import {
  useFacetState,
  useQueryGrid,
  useQueryGridActions,
  useQueryState,
} from "../react/query-grid-provider.tsx";

export interface StatusBoardProps {
  titleField: string;
  detailFields: string[];
  transitions?: [string, string][];
}

interface BoardLanesProps extends StatusBoardProps {
  queries: Map<string, QueryState>;
  showCounts: boolean;
}

function BoardLanes({
  queries,
  showCounts,
  titleField,
  detailFields,
  transitions,
}: BoardLanesProps) {
  const { def, source } = useQueryGrid();
  const { moveRow } = useQueryGridActions();
  const messages = useMessages();
  const locale = useLocale();
  const facetState = useFacetState();
  const [board] = useState(() =>
    createBoard(def, source, queries, transitions ?? null),
  );
  const state = useStoreValue(board.subscribe, board.getState);
  const [error, setError] = useState<string | null>(null);
  const facetField = getFacetField(def);

  if (!state.transitions) {
    return (
      <p className="qg-notice" data-board-state="loading">
        {messages.loading}
      </p>
    );
  }

  const onMove = async (id: string, to: string, details: BoardMoveDetails) => {
    try {
      await moveRow(board, { id, to, ...details });
      setError(null);
    } catch (failure) {
      const problem = toProblem(failure);
      setError(
        problem.code === "request_failed"
          ? messages.moveFailed
          : formatProblemMessage(messages, problem, locale),
      );
      throw failure;
    }
  };

  return (
    <BaseStatusBoard
      lanes={[...state.lanes].map(([status, lane]) => {
        const facet = facetState.result.find((item) => item.value === status);
        return {
          id: status,
          label: facetField ? formatValue(facetField, status, locale) : status,
          count: showCounts && facet ? facet.count : null,
          rows: lane.rows,
          hasNext: lane.hasNext,
          onEndReached: () => board.loadMore(status),
        };
      })}
      fields={def.fields}
      titleField={titleField}
      detailFields={detailFields}
      onMove={onMove}
      canMove={board.canMove}
      message={error}
    />
  );
}

export function StatusBoard(props: StatusBoardProps) {
  const { def, source } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const queries = getLaneQueries(def, query, source.capabilities);
  if (!queries) {
    return (
      <p className="qg-notice" data-board-state="unavailable">
        {messages.boardUnavailable}
      </p>
    );
  }
  return (
    <BoardLanes
      key={JSON.stringify([...queries.values()])}
      queries={queries}
      showCounts={source.capabilities.isFacetCountExact(query)}
      {...props}
    />
  );
}
