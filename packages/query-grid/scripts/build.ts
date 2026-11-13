import { transformAsync } from "@babel/core";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const src = join(root, "src");
const dist = join(root, "dist");

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSources(path);
    }
    const isSource =
      /\.tsx?$/.test(entry.name) && !/\.(test|fixture)\.tsx?$/.test(entry.name);
    return isSource ? [path] : [];
  });
}

rmSync(dist, { recursive: true, force: true });

for (const file of listSources(src)) {
  const result = await transformAsync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [
      ["@babel/preset-react", { runtime: "automatic" }],
      [
        "@babel/preset-typescript",
        { rewriteImportExtensions: true, onlyRemoveTypeImports: true },
      ],
    ],
    plugins: [["babel-plugin-react-compiler", { target: "19" }]],
  });
  if (!result?.code) {
    throw new Error(`babel produced nothing for ${file}`);
  }
  const target = join(dist, relative(src, file).replace(/\.tsx?$/, ".js"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${result.code}\n`);
}

const tsc = Bun.spawnSync(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode ?? 1);
}

function listDeclarations(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listDeclarations(path);
    }
    return entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

for (const file of listDeclarations(dist)) {
  const text = readFileSync(file, "utf8");
  writeFileSync(
    file,
    text.replace(/(["'])(\.{1,2}\/[^"']+)\.tsx?\1/g, "$1$2.js$1"),
  );
}

cpSync(join(src, "ui", "styles.css"), join(dist, "ui", "styles.css"));
console.log("built dist");
