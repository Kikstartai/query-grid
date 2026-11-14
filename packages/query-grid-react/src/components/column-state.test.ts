import { describe, expect, test } from "bun:test";

import {
  beginResize,
  cancelResize,
  COLUMN_MAX_WIDTH,
  COLUMN_MIN_WIDTH,
  defaultColumns,
  layoutColumns,
  normalizeColumns,
  patchColumn,
  reorderColumns,
  resizeWidth,
  stepWidth,
  type ColumnState,
} from "./column-state.ts";
import { createColumnStore } from "../react/column-store.ts";
import { TEST_FIELDS } from "./fields.fixture.ts";

describe("the width rule", () => {
  const session = beginResize("name", 200);

  test("the new width is the start width plus the pointer delta", () => {
    expect(resizeWidth(session, 37)).toBe(237);
    expect(resizeWidth(session, -37)).toBe(163);
    expect(resizeWidth(session, 0)).toBe(200);
    expect(resizeWidth(session, 12.6)).toBe(213);
  });

  test("it clamps at both ends", () => {
    expect(resizeWidth(session, -1000)).toBe(COLUMN_MIN_WIDTH);
    expect(resizeWidth(session, -141)).toBe(COLUMN_MIN_WIDTH);
    expect(resizeWidth(session, -140)).toBe(60);
    expect(resizeWidth(session, 400)).toBe(600);
    expect(resizeWidth(session, 401)).toBe(COLUMN_MAX_WIDTH);
    expect(resizeWidth(session, 5000)).toBe(COLUMN_MAX_WIDTH);
  });

  test("a drag is measured from the start width, not the last width", () => {
    resizeWidth(session, 300);
    expect(resizeWidth(session, 10)).toBe(210);
  });

  test("Escape restores the start width", () => {
    resizeWidth(session, 250);
    expect(cancelResize(session)).toBe(200);
    expect(cancelResize(beginResize("name", 95))).toBe(95);
  });

  test("arrow keys step by 10, and by 50 with Shift", () => {
    expect(stepWidth(200, "ArrowRight", false)).toBe(210);
    expect(stepWidth(200, "ArrowLeft", false)).toBe(190);
    expect(stepWidth(200, "ArrowRight", true)).toBe(250);
    expect(stepWidth(200, "ArrowLeft", true)).toBe(150);
  });

  test("keyboard steps clamp too", () => {
    expect(stepWidth(65, "ArrowLeft", false)).toBe(60);
    expect(stepWidth(60, "ArrowLeft", true)).toBe(60);
    expect(stepWidth(595, "ArrowRight", false)).toBe(600);
    expect(stepWidth(580, "ArrowRight", true)).toBe(600);
  });

  test("right to left mirrors the pointer delta and the arrow keys", () => {
    expect(resizeWidth(session, -37, true)).toBe(237);
    expect(resizeWidth(session, 37, true)).toBe(163);
    expect(stepWidth(200, "ArrowLeft", false, true)).toBe(210);
    expect(stepWidth(200, "ArrowRight", true, true)).toBe(150);
  });

  test("another key leaves the width alone", () => {
    expect(stepWidth(200, "ArrowUp", false)).toBe(200);
    expect(stepWidth(200, "Enter", true)).toBe(200);
  });
});

describe("column state", () => {
  const columns = defaultColumns(TEST_FIELDS);

  test("stored state is guarded and completed", () => {
    const stored = [
      { key: "name", width: 9999, visible: false, pinned: true },
      { key: "gone", width: 100, visible: true, pinned: false },
      { key: "name", width: 100 },
      { key: "total", width: "wide" },
      null,
    ];
    const normalized = normalizeColumns(TEST_FIELDS, stored) as ColumnState[];
    expect(normalized.map((column) => column.key)).toEqual([
      "name",
      "total",
      "id",
      "number",
      "created_at",
      "status",
      "region",
      "note",
    ]);
    expect(normalized[0]).toEqual({
      key: "name",
      width: 600,
      visible: false,
      pinned: true,
    });
    expect(normalized[1].width).toBe(150);
    expect(normalizeColumns(TEST_FIELDS, "junk")).toBeNull();
  });

  test("a reorder moves only the listed columns", () => {
    const moved = reorderColumns(columns, ["total", "number", "created_at"]);
    expect(moved.map((column) => column.key).slice(0, 4)).toEqual([
      "id",
      "total",
      "number",
      "created_at",
    ]);
  });

  test("pinned columns lead the layout and carry their offset", () => {
    const pinned = columns.map((column) =>
      column.key === "status" || column.key === "number"
        ? { ...column, pinned: true, width: 100 }
        : column,
    );
    const layout = layoutColumns(TEST_FIELDS, pinned);
    expect(layout.slice(0, 3).map((column) => column.field.key)).toEqual([
      "number",
      "status",
      "id",
    ]);
    expect(layout.map((column) => column.start).slice(0, 3)).toEqual([
      0, 100, 0,
    ]);
  });

  test("the store saves through the host function after a restore", async () => {
    const saved: ColumnState[][] = [];
    const store = createColumnStore(TEST_FIELDS, {
      load: async () => [{ key: "name", width: 222 }],
      save: (state) => {
        saved.push(state);
      },
    });
    store.setColumns(patchColumn(store.getColumns(), "total", { width: 300 }));
    await store.restore();
    expect(store.getColumns()[0]).toMatchObject({ key: "name", width: 222 });
    store.setColumns(patchColumn(store.getColumns(), "name", { width: 60 }));
    store.setColumns(
      patchColumn(store.getColumns(), "note", { visible: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toMatchObject({ key: "name", width: 60 });
    expect(saved[0].find((column) => column.key === "note")?.visible).toBe(
      false,
    );
  });
});
