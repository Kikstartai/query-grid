import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const QUERY_LAYER =
  /query-grid-(provider|context|hooks|format)|url-state|@kikstart\/query-grid\/(http|memory)|\b(useQueryGrid|useQueryGridActions|useQueryState|useOfferContext|useOffers|useOfferState|useFeedState|useCountState|useTotalState|useFacetState|useFieldLabels|useFilterChips|useColumns|useGridView|createFeed|createQueryStore|DataSource|DataSourceCapabilities|encodeQuery|decodeQuery|applyAction|listOffers)\b/;
const JSX_TEXT = /[\w"}]>\s*[A-Za-z][A-Za-z ,.:…]{2,}\s*<\//;
const LITERAL_LABEL = /(aria-label|placeholder|title|alt)="[^"]+"/;

function listSources(): string[] {
  return readdirSync(import.meta.dir)
    .filter((name) => /\.tsx?$/.test(name) && !/\.(test|fixture)\./.test(name))
    .map((name) => join(import.meta.dir, name));
}

describe("the base components", () => {
  test("none imports a provider hook or names a query concept", () => {
    expect(
      listSources().filter((path) =>
        QUERY_LAYER.test(readFileSync(path, "utf8")),
      ),
    ).toEqual([]);
  });

  test("none holds an English literal outside the default messages", () => {
    const offenders = listSources()
      .filter((path) => !path.endsWith("messages.tsx"))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => JSX_TEXT.test(line) || LITERAL_LABEL.test(line))
          .map((line) => `${path}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
