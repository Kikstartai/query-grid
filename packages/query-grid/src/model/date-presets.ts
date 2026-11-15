export const DATE_PRESETS = [
  "today",
  "yesterday",
  "last-7-days",
  "last-30-days",
  "this-month",
  "last-month",
  "this-year",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export interface DateBounds {
  min: string;
  max: string;
}

export function isDatePreset(value: string): value is DatePreset {
  return DATE_PRESETS.some((preset) => preset === value);
}

function toBounds(first: Date, afterLast: Date): DateBounds {
  const last = new Date(afterLast.getTime() - 1);
  return {
    min: first.toISOString(),
    max: last.toISOString().replace(".999Z", ".999999Z"),
  };
}

// The Date constructor reads its parts in the system time zone, so each bound is a whole day where the viewer is, sent as the instant it starts or ends.
export function resolveDatePreset(preset: DatePreset, now: Date): DateBounds {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  switch (preset) {
    case "today":
      return toBounds(
        new Date(year, month, day),
        new Date(year, month, day + 1),
      );
    case "yesterday":
      return toBounds(
        new Date(year, month, day - 1),
        new Date(year, month, day),
      );
    case "last-7-days":
      return toBounds(
        new Date(year, month, day - 6),
        new Date(year, month, day + 1),
      );
    case "last-30-days":
      return toBounds(
        new Date(year, month, day - 29),
        new Date(year, month, day + 1),
      );
    case "this-month":
      return toBounds(new Date(year, month, 1), new Date(year, month + 1, 1));
    case "last-month":
      return toBounds(new Date(year, month - 1, 1), new Date(year, month, 1));
    case "this-year":
      return toBounds(new Date(year, 0, 1), new Date(year + 1, 0, 1));
  }
}
