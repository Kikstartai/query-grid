import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const tsc = Bun.spawnSync(
  ["bun", "x", "tsc", "-p", "tsconfig.build.json", "--listEmittedFiles"],
  { cwd: root, stdout: "pipe", stderr: "inherit" },
);
const lines = tsc.stdout.toString().split(/\r?\n/);
const written = new Set(
  lines
    .filter((line) => line.startsWith("TSFILE: "))
    .map((line) => resolve(line.slice("TSFILE: ".length))),
);
const output = lines.filter((line) => line && !line.startsWith("TSFILE: "));
if (output.length > 0) {
  console.log(output.join("\n"));
}
if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode ?? 1);
}

// A running dev server watches dist, so it is overwritten in place and pruned, never wiped.
for (const file of listFiles(dist)) {
  if (!written.has(resolve(file))) {
    rmSync(file);
  }
}
console.log("built dist");
