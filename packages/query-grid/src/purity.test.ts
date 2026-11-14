import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const FORBIDDEN_IMPORT = /from "(react|react-dom|pg|@ui-sdk)[/"]/;
const DOM_GLOBAL = /\b(window|document|localStorage|navigator|HTMLElement)\b/;

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSources(path);
    }
    return /\.test\.ts$/.test(entry.name) ? [] : [path];
  });
}

describe("core stays free of React, the DOM and pg", () => {
  test("no source file imports React, UI SDK or pg, or names a DOM global", () => {
    const offenders = listSources(join(root, "src")).filter((path) => {
      const text = readFileSync(path, "utf8");
      return FORBIDDEN_IMPORT.test(text) || DOM_GLOBAL.test(text);
    });
    expect(offenders).toEqual([]);
  });

  test("the package declares no runtime or peer dependency", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  test("the compiler runs without the DOM library", () => {
    const config = JSON.parse(
      readFileSync(join(root, "tsconfig.json"), "utf8"),
    ) as { compilerOptions: { lib: string[] } };
    expect(config.compilerOptions.lib).toEqual(["ES2022"]);
  });
});
