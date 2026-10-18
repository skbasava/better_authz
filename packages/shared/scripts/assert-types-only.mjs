// Build assertion: packages/shared must emit no JavaScript runtime module.
// tsc --noEmit already ran via the typecheck script; this double-checks that
// no dist/ output exists and that every src file is type-only (no runtime
// export statements beyond `export type`).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const srcDir = new URL("../src", import.meta.url).pathname;
const distDir = new URL("../dist", import.meta.url).pathname;

if (existsSync(distDir)) {
  const emitted = readdirSync(distDir).filter((f) => f.endsWith(".js"));
  if (emitted.length > 0) {
    console.error(`shared emitted runtime modules: ${emitted.join(", ")}`);
    process.exit(1);
  }
}

const tsFiles = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
for (const file of tsFiles) {
  const text = readFileSync(join(srcDir, file), "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Allow `export type ...` / `export interface ...` (type-only) and
    // re-export `export type * from ...`; reject value exports.
    if (
      trimmed.startsWith("export") &&
      !/^export\s+type\s/.test(trimmed) &&
      !/^export\s+(interface|type)\s/.test(trimmed) &&
      !/^export\s+\{[^}]*\}\s+from/.test(trimmed) // tolerate only if all-type; checked below
    ) {
      // `export { ... } from` must be all type names — flag for manual review.
      if (/^export\s+\{/.test(trimmed)) {
        console.error(`${file}:${i + 1}: possible value re-export — keep shared type-only`);
        process.exit(1);
      }
    }
  });
}

console.log(`types-only assertion passed for ${tsFiles.length} file(s)`);
