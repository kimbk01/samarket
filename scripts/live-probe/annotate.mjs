// Print live-probe results as GitHub annotations (readable via the check-runs API).
import { existsSync, readFileSync } from "node:fs";
const f = process.argv[2] || "live-probe-results.json";
if (!existsSync(f)) {
  console.log("::error title=live-probe::no results file");
  process.exit(0);
}
const rows = JSON.parse(readFileSync(f, "utf8"));
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
// GitHub keeps at most 10 annotations per level per step → one annotation per site.
const bySite = new Map();
for (const r of rows) bySite.set(r.site, [...(bySite.get(r.site) || []), r]);
for (const [site, list] of bySite) {
  const failed = list.some((r) => r.result === "FAIL");
  const level = failed ? "warning" : "notice";
  const body = list.map((r) => `[${r.result}] ${r.check}: ${r.detail}`).join("\n");
  console.log(`::${level} title=${esc(`${failed ? "FAIL" : "PASS"} ${site}`)}::${esc(body)}`);
}
console.log(`PASS ${rows.filter((r) => r.result === "PASS").length} / FAIL ${rows.filter((r) => r.result === "FAIL").length}`);
