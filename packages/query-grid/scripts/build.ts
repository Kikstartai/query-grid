import { rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
rmSync(join(root, "dist"), { recursive: true, force: true });

const tsc = Bun.spawnSync(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode ?? 1);
}
console.log("built dist");
