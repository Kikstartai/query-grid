"use client";

import { useEffect, useState } from "react";

import {
  createFeed,
  createQueryStore,
  getField,
  toProblem,
  type Capabilities,
  type DataSource,
  type Feed,
  type FeedState,
  type GridDef,
  type QueryState,
} from "@kikstart/query-grid";

import { formatProblemMessage, useMessages } from "../components/messages.tsx";
import {
  StatusBoard as BaseStatusBoard,
  type BoardMoveDetails,
} from "../components/status-board.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import {
  useFacetState,
  useQueryGrid,
  useQueryState,
} from "../react/query-grid-provider.tsx";

const LANE_PAGE = 50;

interface BoardData {
  feeds: Map<string, Feed>;
  subscribe: (listener: () => void) => () => void;
  getStates: () => Map<string, FeedState>;
}

function createBoardData(
  def: GridDef,
  source: DataSource,
  queries: Map<string, QueryState>,
): BoardData {
  const feeds = new Map(
    [...queries].map(([status, query]) => [
      status,
      createFeed(
        createQueryStore(def, source.capabilities, query, "board"),
        source,
        LANE_PAGE,
      ),
    ]),
  );
  let states: Map<string, FeedState> | null = null;
  return {
    feeds,
    subscribe: (listener) => {
      const changed = () => {
        states = null;
        listener();
      };
      const cleanups = [...feeds.values()].map((feed) =>
        feed.subscribe(changed),
      );
      return () => cleanups.forEach((cleanup) => cleanup());
    },
    getStates: () => {
      states ??= new Map(
        [...feeds].map(([status, feed]) => [status, feed.getState()]),
      );
      return states;
    },
  };
}

function listLaneQueries(
  def: GridDef,
  query: QueryState,
  capabilities: Capabilities,
): Map<string, QueryState> | null {
  const field = def.facet ? getField(def, def.facet.field) : null;
  if (!field?.options) {
    return null;
  }
  const memory = capabilities.mode === "memory";
  const selected = query.equals[field.key];
  const statuses = field.options
    .map((option) => option.value)
    .filter((value) => selected === undefined || selected.includes(value));
  const base: QueryState = memory
    ? { ...query, cursor: null }
    : { ...query, range: null, sort: def.defaultSort, cursor: null };
  const queries = new Map<string, QueryState>(
    statuses.map((status) => [
      status,
      { ...base, equals: { ...query.equals, [field.key]: [status] } },
    ]),
  );
  const combinable = memory || (query.quick === null && query.range === null);
  const answerable =
    combinable && [...queries.values()].every(capabilities.isAnswerable);
  return answerable ? queries : null;
}

export interface StatusBoardProps {
  titleField: string;
  detailFields: string[];
}

interface BoardLanesProps extends StatusBoardProps {
  queries: Map<string, QueryState>;
  showCounts: boolean;
  transitions: [string, string][];
}

function BoardLanes({
  queries,
  showCounts,
  transitions,
  titleField,
  detailFields,
}: BoardLanesProps) {
  const { def, source, feed, facets, counts, totals } = useQueryGrid();
  const messages = useMessages();
  const facetState = useFacetState();
  const [data] = useState(() => createBoardData(def, source, queries));
  const states = useStoreValue(data.subscribe, data.getStates);
  const [error, setError] = useState<string | null>(null);
  const facetField = getField(def, def.facet?.field ?? "");

  const onMove = async (id: string, to: string, details: BoardMoveDetails) => {
    try {
      const updated = await source.changeFacetValue(id, to);
      data.feeds.get(details.from)?.removeRow(id);
      data.feeds.get(to)?.insertRow(details.index, updated);
      feed.patchRow(id, updated);
      facets.reload();
      counts.reload();
      totals.reload();
      setError(null);
    } catch (failure) {
      const problem = toProblem(failure);
      setError(
        problem.code === "request_failed"
          ? messages.moveFailed
          : formatProblemMessage(messages, problem, def.format),
      );
      throw failure;
    }
  };

  return (
    <BaseStatusBoard
      lanes={[...data.feeds].map(([status, laneFeed]) => {
        const state = states.get(status);
        const facet = facetState.counts.find((item) => item.value === status);
        return {
          id: status,
          label:
            facetField?.options?.find((item) => item.value === status)?.label ??
            status,
          count: showCounts && facet ? facet.count : null,
          rows: state?.rows ?? [],
          hasNext: state?.hasNext ?? false,
          onEndReached: laneFeed.loadMore,
        };
      })}
      fields={def.fields}
      titleField={titleField}
      detailFields={detailFields}
      onMove={onMove}
      canMove={(from, to) =>
        transitions.some(([start, end]) => start === from && end === to)
      }
      message={error}
      format={def.format}
    />
  );
}

function useTransitions(source: DataSource): [string, string][] | null {
  const [transitions, setTransitions] = useState<[string, string][] | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setTransitions(await source.fetchTransitions(controller.signal));
      } catch {
        return;
      }
    };
    void load();
    return () => controller.abort();
  }, [source]);
  return transitions;
}

export function StatusBoard(props: StatusBoardProps) {
  const { def, source } = useQueryGrid();
  const messages = useMessages();
  const query = useQueryState();
  const transitions = useTransitions(source);
  const queries = listLaneQueries(def, query, source.capabilities);
  if (!queries) {
    return (
      <p className="qg-notice" data-board-state="unavailable">
        {messages.boardUnavailable}
      </p>
    );
  }
  if (!transitions) {
    return (
      <p className="qg-notice" data-board-state="loading">
        {messages.loading}
      </p>
    );
  }
  return (
    <BoardLanes
      key={JSON.stringify([...queries.values()])}
      queries={queries}
      showCounts={source.capabilities.isFacetCountShown(query)}
      transitions={transitions}
      {...props}
    />
  );
}
