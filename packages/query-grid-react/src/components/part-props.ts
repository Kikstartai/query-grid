import type { CSSProperties } from "react";

export const FILL_COLUMN_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  minWidth: 0,
  flex: "1 1 0%",
};

type DataAttributes = Record<`data-${string}`, string | number | undefined>;

export function withData<T extends object>(props: T, data: DataAttributes): T {
  return { ...props, ...data };
}
