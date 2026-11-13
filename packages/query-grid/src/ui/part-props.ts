type DataAttributes = Record<`data-${string}`, string | number | undefined>;

export function withData<T extends object>(props: T, data: DataAttributes): T {
  return { ...props, ...data };
}
