import {
  getField,
  getFieldLabel,
  getOperatorShape,
  resolveFieldKind,
  type BaseGridDef,
  type ChipValue,
  type FieldChip,
  type FilterChip,
  type SortDirection,
  type UnavailableReason,
} from "@kikstart/query-grid";

import type { ChipItem } from "../components/filter-bar.tsx";
import {
  formatBoolean,
  formatList,
  formatOpLabel,
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

function formatChipValue(
  messages: QueryGridMessages,
  value: ChipValue,
  boolean: boolean,
): string {
  if (value.value === null) {
    return messages.blankValue;
  }
  return boolean ? formatBoolean(messages, value.value) : (value.text ?? "");
}

function formatFieldChip(
  messages: QueryGridMessages,
  def: BaseGridDef,
  chip: FieldChip,
  label: string,
): string {
  const field = getField(def, chip.field);
  const op = field ? formatOpLabel(messages, field, chip.op) : chip.op;
  const text = field !== null && resolveFieldKind(field) === "text";
  const [first = "", second = ""] = chip.operands.map((operand) =>
    text ? messages.chipText({ value: operand }) : operand,
  );
  switch (getOperatorShape(chip.op)) {
    case "list":
      return messages.chipList({ label, op });
    case "none":
      return messages.chipNone({ label, op });
    case "pair":
      return messages.chipPair({ label, op, min: first, max: second });
    case "preset":
      return messages.chipOne({
        label,
        op,
        value: chip.preset ? messages.datePresets[chip.preset] : "",
      });
    case "one":
      return messages.chipOne({ label, op, value: first });
  }
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
    case "filter": {
      const boolean = getField(def, chip.field)?.type === "boolean";
      const listed = getOperatorShape(chip.op) === "list";
      return {
        id: chip.id,
        kind: chip.kind,
        label: formatFieldChip(messages, def, chip, label),
        values: listed
          ? chip.values.map((value) => ({
              id: value.value ?? "",
              label: formatChipValue(messages, value, boolean),
            }))
          : undefined,
        removable,
      };
    }
    case "combine":
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
