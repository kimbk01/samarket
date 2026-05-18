import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = [
  "app/(main)/market",
  "app/(main)/post",
  "app/(main)/write",
  "app/(main)/products",
  "components/home",
  "components/trade",
  "components/write/trade",
  "components/search",
];
const r = spawnSync(process.execPath, ["scripts/check-hardcoded-korean.mjs", ...paths], {
  cwd: ROOT,
  encoding: "utf8",
});
const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
const byFile = {};
for (const line of o.split(/\r?\n/)) {
  const m = line.match(/^  ([^:]+):\d+:/);
  if (!m) continue;
  byFile[m[1]] = (byFile[m[1]] ?? 0) + 1;
}
const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
console.log("total", sorted.reduce((s, [, c]) => s + c, 0), "files", sorted.length);
for (const [f, c] of sorted) console.log(c, f);
