"use client";

import type { Virtualizer } from "@ui-sdk/core";
import {
  usePart,
  usePrimitive,
  type PrimitiveHandle,
} from "@ui-sdk/react/primitive";
import { useEffect, useState } from "react";

import {
  formatCount,
  formatValue,
  type BaseFieldDef,
  type GridRow,
} from "@kikstart/query-grid";

import {
  board,
  CARD_GAP,
  CARD_HEIGHT,
  type BoardMove,
  type BoardSource,
} from "./board-primitive.ts";
import { useLocale, useMessages } from "./messages.tsx";
import { FILL_COLUMN_STYLE, withData } from "./part-props.ts";
import { useLatest } from "./use-latest.ts";
import { useVirtualItems } from "./use-virtual-items.ts";

type BoardHandle = PrimitiveHandle<typeof board>;

export interface BoardLane {
  id: string;
  label: string;
  count?: number | null;
  rows: GridRow[];
  hasNext: boolean;
  onEndReached: () => void;
}

export interface BoardMoveDetails {
  from: string;
  index: number;
}

export interface StatusBoardProps {
  lanes: BoardLane[];
  fields: BaseFieldDef[];
  titleField: string;
  detailFields: string[];
  onMove: (
    id: string,
    to: string,
    details: BoardMoveDetails,
  ) => void | Promise<unknown>;
  canMove: (from: string, to: string) => boolean;
  message?: string | null;
}

interface BoardCardBodyProps {
  row: GridRow | undefined;
  title: BaseFieldDef;
  details: BaseFieldDef[];
}

function BoardCardBody({ row, title, details }: BoardCardBodyProps) {
  const locale = useLocale();
  if (!row) {
    return null;
  }
  return (
    <>
      <div className="qg-board-card-title">
        <bdi>
          {title.label} {formatValue(title, row[title.key] ?? null, locale)}
        </bdi>
      </div>
      {details.map((field) => (
        <div key={field.key} className="qg-board-card-detail">
          <bdi>{formatValue(field, row[field.key] ?? null, locale)}</bdi>
        </div>
      ))}
    </>
  );
}

interface BoardCardProps extends BoardCardBodyProps {
  id: string;
  index: number;
  start: number;
}

function BoardCard({ id, index, start, row, title, details }: BoardCardProps) {
  return usePart(
    board,
    "card",
    { value: id },
    withData(
      {
        role: "listitem",
        className: "qg-board-card",
        style: {
          position: "absolute" as const,
          top: 0,
          insetInline: CARD_GAP,
          boxSizing: "border-box" as const,
          overflow: "hidden",
          height: CARD_HEIGHT,
          transform: `translateY(${start + CARD_GAP}px)`,
        },
        children: <BoardCardBody row={row} title={title} details={details} />,
      },
      { "data-card": id, "data-index": index },
    ),
    "div",
  );
}

interface LaneContent {
  rows: Map<string, GridRow>;
  title: BaseFieldDef;
  details: BaseFieldDef[];
}

interface LaneCardsProps extends LaneContent {
  ids: string[];
  virtual: Virtualizer;
}

function LaneCards({ ids, virtual, rows, ...content }: LaneCardsProps) {
  const { items, size } = useVirtualItems(virtual);
  return (
    <div
      data-mounted={items.length}
      style={{ position: "relative", height: size + CARD_GAP }}
    >
      {items.flatMap((item) => {
        const id = ids[item.index];
        return id
          ? [
              <BoardCard
                key={id}
                id={id}
                index={item.index}
                start={item.start}
                row={rows.get(id)}
                {...content}
              />,
            ]
          : [];
      })}
    </div>
  );
}

interface BoardLaneProps extends LaneContent {
  handle: BoardHandle;
  lane: BoardLane;
  syncVersion: number;
}

function BoardLaneColumn({
  handle,
  lane,
  syncVersion,
  ...content
}: BoardLaneProps) {
  const locale = useLocale();
  const [virtual] = useState(() => handle.api.virtualFor(lane.id));
  const laneRows = lane.rows;

  useEffect(() => {
    handle.api.setList(
      lane.id,
      laneRows.map((row) => row.id),
    );
  }, [handle, lane.id, laneRows, syncVersion]);

  const list = usePart(
    handle,
    "column",
    { value: lane.id },
    withData(
      {
        role: "list",
        "aria-label": lane.label,
        className: "qg-board-list",
        style: { minHeight: 0, flex: "1 1 0%", overflowY: "auto" as const },
        children: (state: { ids: string[] }) => (
          <LaneCards ids={state.ids} virtual={virtual} {...content} />
        ),
      },
      { "data-column": lane.id, "data-loaded": laneRows.length },
    ),
    "div",
  );

  return (
    <section
      className="qg-board-column"
      style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}
    >
      <header className="qg-board-column-head">
        <span>{lane.label}</span>
        <span className="qg-board-column-count" data-column-count={lane.id}>
          {lane.count === null || lane.count === undefined
            ? ""
            : formatCount(lane.count, locale)}
        </span>
      </header>
      {list}
    </section>
  );
}

const laneIds = new WeakMap<BoardLane["rows"], Set<string>>();

function listLaneIds(rows: BoardLane["rows"]): Set<string> {
  const ids = laneIds.get(rows) ?? new Set(rows.map((row) => row.id));
  laneIds.set(rows, ids);
  return ids;
}

function laneOf(lanes: BoardLane[], id: string): BoardLane | null {
  return lanes.find((lane) => listLaneIds(lane.rows).has(id)) ?? null;
}

export function StatusBoard(props: StatusBoardProps) {
  const { lanes, fields, titleField, detailFields, message } = props;
  const messages = useMessages();
  const latest = useLatest(props);
  const [syncVersion, setSyncVersion] = useState(0);

  const onMove = (move: BoardMove) => {
    const resync = () => setSyncVersion((version) => version + 1);
    const settle = async () => {
      try {
        await latest.current.onMove(move.id, move.to, {
          from: move.from,
          index: move.index,
        });
      } catch {
        resync();
      }
    };
    void settle();
  };

  const [source] = useState<BoardSource>(() => ({
    statusOf: (id) => laneOf(latest.current.lanes, id)?.id ?? null,
    allows: (from, to) => latest.current.canMove(from, to),
    loadMore: (list) =>
      latest.current.lanes.find((lane) => lane.id === list)?.onEndReached(),
  }));
  const handle = usePrimitive(board, { source, onMove });

  const title = fields.find((field) => field.key === titleField);
  if (!title) {
    return null;
  }
  const details = detailFields.flatMap(
    (key) => fields.find((field) => field.key === key) ?? [],
  );
  const rows = new Map(
    lanes.flatMap((lane) => lane.rows.map((row) => [row.id, row] as const)),
  );
  return (
    <div className="qg-board" data-part="board" style={FILL_COLUMN_STYLE}>
      <p
        className="qg-board-message"
        data-board-message
        data-error={message ? "" : undefined}
      >
        <bdi>{message ?? messages.boardHelp}</bdi>
      </p>
      <div
        className="qg-board-columns"
        style={{
          display: "flex",
          minHeight: 0,
          flex: "1 1 0%",
          overflowX: "auto",
        }}
      >
        {lanes.map((lane) => (
          <BoardLaneColumn
            key={lane.id}
            handle={handle}
            lane={lane}
            rows={rows}
            title={title}
            details={details}
            syncVersion={syncVersion}
          />
        ))}
      </div>
    </div>
  );
}
