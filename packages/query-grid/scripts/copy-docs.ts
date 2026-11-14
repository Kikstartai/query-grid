import { cpSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
cpSync(join(root, "..", "..", "LICENSE"), join(root, "LICENSE"));
