import { transformAsync } from "@babel/core";
import {
  cpSync,
  existsSync,
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

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function isSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.(test|fixture)\.tsx?$/.test(path);
}

const sources = listFiles(src).filter(isSource);
const styles = join(dist, "styles.css");
const written = new Set<string>([styles]);

for (const file of sources) {
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
  const base = join(dist, relative(src, file).replace(/\.tsx?$/, ""));
  mkdirSync(dirname(base), { recursive: true });
  writeFileSync(`${base}.js`, `${result.code}\n`);
  written.add(`${base}.js`);
  written.add(`${base}.d.ts`);
}

const tsc = Bun.spawnSync(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode ?? 1);
}

for (const file of listFiles(dist)) {
  if (!written.has(file)) {
    rmSync(file);
    continue;
  }
  if (file.endsWith(".d.ts")) {
    const text = readFileSync(file, "utf8");
    writeFileSync(
      file,
      text.replace(/(["'])(\.{1,2}\/[^"']+)\.tsx?\1/g, "$1$2.js$1"),
    );
  }
}

cpSync(join(src, "styles.css"), styles);
console.log("built dist");
