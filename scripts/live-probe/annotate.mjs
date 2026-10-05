// Print live-probe results as GitHub annotations (readable via the check-runs API).
import { existsSync, readFileSync } from "node:fs";
const f = "live-probe-results.json";
if (!existsSync(f)) {
  console.log("::error title=live-probe::no results file");
  process.exit(0);
}
const rows = JSON.parse(readFileSync(f, "utf8"));
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
for (const r of rows) {
  const level = r.result === "PASS" ? "notice" : "warning";
  console.log(`::${level} title=${esc(`${r.result} ${r.site} · ${r.check}`)}::${esc(r.detail)}`);
}
console.log(`PASS ${rows.filter((r) => r.result === "PASS").length} / FAIL ${rows.filter((r) => r.result === "FAIL").length}`);
