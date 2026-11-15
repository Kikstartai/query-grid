import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const FORBIDDEN_IMPORT = /from "(react|react-dom|pg|@ui-sdk)[/"]/;
const CONTRACT_COPY =
  /export (function|const|interface|type) (decodeQuery|encodeQuery|validateQueryValues|QueryState|FieldDef|PageResult|CountResult|matchShape|QueryShape)\b/;

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSources(path);
    }
    return /\.test\.ts$/.test(entry.name) ? [] : [path];
  });
}

describe("the server package", () => {
  const sources = listSources(join(root, "src"));

  test("no source file imports React, UI SDK or pg", () => {
    expect(
      sources.filter((path) =>
        FORBIDDEN_IMPORT.test(readFileSync(path, "utf8")),
      ),
    ).toEqual([]);
  });

  test("it depends on core alone", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies)).toEqual([
      "@kikstart/query-grid",
    ]);
  });

  test("it holds no copy of the query contract", () => {
    expect(
      sources.filter((path) => CONTRACT_COPY.test(readFileSync(path, "utf8"))),
    ).toEqual([]);
  });
});
