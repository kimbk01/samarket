// Turn the `supabase start` log into annotations: success, or the failing migration + error.
import { existsSync, readFileSync } from "node:fs";
const [file, outcome, schemaFile, schemaOutcome] = process.argv.slice(2);
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const log = existsSync(file) ? readFileSync(file, "utf8") : "";
const applied = (log.match(/Applying migration/g) || []).length;
if (outcome === "success") {
  console.log(`::notice title=${esc("PASS staging DB · migration replay")}::${esc(`local Supabase started (empty), migrations replayed=${applied}`)}`);
} else {
  const lastApplying = [...log.matchAll(/Applying migration ([^\n]+)/g)].pop()?.[1] ?? "?";
  // Postgres errors look like `ERROR: ... (SQLSTATE xxxxx)` followed by `At statement N:` — skip docker pull noise.
  const errIdx = log.search(/ERROR: |SQLSTATE|At statement|failed to apply|error running container/i);
  const tail = errIdx >= 0 ? log.slice(Math.max(0, errIdx - 200), errIdx + 1800) : log.slice(-1500);
  console.log(`::warning title=${esc("FAIL staging DB · migration replay")}::${esc(`applied=${applied} last=${lastApplying}\n${tail}`)}`);
}

if (schemaFile) {
  const sl = existsSync(schemaFile) ? readFileSync(schemaFile, "utf8") : "";
  const ok = schemaOutcome === "success" && /rpc=1/.test(sl);
  console.log(`::${ok ? "notice" : "warning"} title=${esc(`${ok ? "PASS" : "FAIL"} staging DB · schema snapshot + publish-RPC migration`)}::${esc(sl.slice(-1500) || "(no output)")}`);
}
