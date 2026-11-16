import {
  getField,
  getFieldLabel,
  isDatePreset,
  type BaseGridDef,
  type ChipValue,
  type FilterChip,
  type RangeChip,
  type SortDirection,
  type UnavailableReason,
} from "@kikstart/query-grid";

import type { ChipItem } from "../components/filter-bar.tsx";
import {
  formatBoolean,
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

function formatEqualsValue(
  messages: QueryGridMessages,
  value: ChipValue,
  boolean: boolean,
): string {
  if (value.reserved) {
    return formatReservedValue(messages, value.reserved);
  }
  return boolean ? formatBoolean(messages, value.value) : value.text;
}

function formatRangeChip(
  messages: QueryGridMessages,
  chip: RangeChip,
  label: string,
): string {
  if (chip.preset !== null && isDatePreset(chip.preset)) {
    return messages.chipPreset({
      label,
      preset: messages.datePresets[chip.preset],
    });
  }
  const params = {
    label,
    min: chip.min ?? messages.openBound,
    max: chip.max ?? messages.openBound,
  };
  return chip.op === null || chip.op === "between"
    ? messages.chipRange(params)
    : messages.chipRangeOps[chip.op](params);
}

function formatArrow(direction: SortDirection): string {
  return direction === "asc" ? "↑" : "↓";
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
    case "equals": {
      const boolean = getField(def, chip.field)?.type === "boolean";
      return {
        id: chip.id,
        kind: chip.kind,
        label: chip.excluded
          ? messages.chipExclude({ label })
          : messages.chipEquals({ label }),
        values: chip.values.map((value) => ({
          id: value.value,
          label: formatEqualsValue(messages, value, boolean),
        })),
        removable,
      };
    }
    case "overlap":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipOverlap({ label }),
        values: chip.values.map((value) => ({
          id: value.value,
          label: value.text,
        })),
        removable,
      };
    case "range":
      return {
        id: chip.id,
        kind: chip.kind,
        label: formatRangeChip(messages, chip, label),
        removable,
      };
    case "text":
      return {
        id: chip.id,
        kind: chip.kind,
        label: messages.chipTexts[chip.op]({ label, value: chip.value }),
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
        label: [
          messages.chipSort({ label, direction: formatArrow(chip.direction) }),
          ...chip.then.map((sort) =>
            messages.chipSortThen({
              label: getFieldLabel(def, sort.field),
              direction: formatArrow(sort.direction),
            }),
          ),
        ].join(""),
        removable,
      };
  }
}
