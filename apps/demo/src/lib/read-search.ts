export type SearchRecord = Record<string, string | string[] | undefined>;

export type SearchParams = Promise<SearchRecord>;

export function normalizeSearch(record: SearchRecord): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(record)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        params.append(name, item);
      }
    }
  }
  return params.toString();
}
