export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function readSearch(searchParams: SearchParams): Promise<string> {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        params.append(name, item);
      }
    }
  }
  return params.toString();
}
