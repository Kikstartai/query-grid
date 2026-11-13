import { cpSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
for (const name of ["README.md", "LICENSE"]) {
  cpSync(join(root, "..", "..", name), join(root, name));
}
