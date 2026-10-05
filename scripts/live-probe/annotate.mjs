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
// Staging steps are named "N name": group by step number so there are never more than 9 groups.
const groupKey = (site) => (/^\d+ /.test(site) ? `step ${site.split(" ")[0]}` : site);
for (const r of rows) bySite.set(groupKey(r.site), [...(bySite.get(groupKey(r.site)) || []), r]);
const out = { notice: [], warning: [] };
for (const [site, list] of bySite) {
  const failed = list.some((r) => r.result === "FAIL");
  const body = list.map((r) => `[${r.result}] ${r.site} · ${r.check}: ${r.detail}`).join("\n");
  out[failed ? "warning" : "notice"].push({ title: `${failed ? "FAIL" : "PASS"} ${site}`, body });
}
// Merge neighbours when a level has more than 9 groups, so nothing is dropped by the cap.
for (const [level, groups] of Object.entries(out)) {
  const size = Math.ceil(groups.length / 9) || 1;
  for (let i = 0; i < groups.length; i += size) {
    const part = groups.slice(i, i + size);
    console.log(`::${level} title=${esc(part.map((g) => g.title).join(" + "))}::${esc(part.map((g) => g.body).join("\n"))}`);
  }
}
console.log(`PASS ${rows.filter((r) => r.result === "PASS").length} / FAIL ${rows.filter((r) => r.result === "FAIL").length}`);
