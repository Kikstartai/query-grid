import {
  getFieldLabel,
  isDatePreset,
  type BaseGridDef,
  type FilterChip,
  type UnavailableReason,
} from "@kikstart/query-grid";

import type { ChipItem } from "../components/filter-bar.tsx";
import {
  formatList,
  formatReservedValue,
  formatRows,
  type QueryGridMessages,
} from "../components/messages.tsx";

export function formatReason(
  messages: QueryGridMessages,
  def: BaseGridDef,
  reason: UnavailableReason,
  locale: string,
): string {
  const label = reason.field ? getFieldLabel(def, reason.field) : "";
  const rows = formatRows(messages, reason.rows ?? 0, locale, reason.capped);
  const narrowBy = formatList(
    locale,
    reason.narrowBy.map((key) => getFieldLabel(def, key)),
    "disjunction",
  );
  const blockers = formatList(locale, [
    ...reason.filters.map((key) =>
      messages.reasonParts.filter(getFieldLabel(def, key)),
    ),
    ...reason.ranges.map((key) =>
      messages.reasonParts.range(getFieldLabel(def, key)),
    ),
    messages.reasonParts.sort(getFieldLabel(def, reason.sort)),
  ]);
  return messages.reasons[reason.code]({ label, blockers, rows, narrowBy });
}

export function formatChip(
  messages: QueryGridMessages,
  def: BaseGridDef,
  chip: FilterChip,
): ChipItem {
  const label =
    "field" in chip ? getFieldLabel(def, chip.field) : messages.searchFilter;
  const removable = chip.clear !== null;
  switch (chip.kind) {
    case "equals":
      return {
        id: chip.id,
        kind: chip.kind,
        label: chip.excluded
          ? messages.chipExclude({ label })
          : messages.chipEquals({ label }),
        values: chip.values.map((value) => ({
          id: value.value,
          label: value.reserved
            ? formatReservedValue(messages, value.reserved)
            : value.text,
        })),
        removable,
      };
    case "range":
      return {
        id: chip.id,
        kind: chip.kind,
        label:
          chip.preset !== null && isDatePreset(chip.preset)
            ? messages.chipPreset({
                label,
                preset: messages.datePresets[chip.preset],
              })
            : messages.chipRange({
                label,
                min: chip.min ?? messages.openBound,
                max: chip.max ?? messages.openBound,
              }),
        removable,
      };
    case "contains":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipContains({ label, value: chip.value }),
        removable,
      };
    case "match":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipMatchAny,
        removable,
      };
    case "group":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipGroup({ label }),
        removable,
      };
    case "search":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipSearch({ value: chip.value }),
        removable,
      };
    case "sort":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipSort({
          label,
          direction: chip.direction === "asc" ? "↑" : "↓",
        }),
        removable,
      };
  }
}
