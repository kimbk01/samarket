// Turn the `supabase start` log into annotations: success, or the failing migration + error.
import { existsSync, readFileSync } from "node:fs";
const [file, outcome] = process.argv.slice(2);
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const log = existsSync(file) ? readFileSync(file, "utf8") : "";
const applied = (log.match(/Applying migration/g) || []).length;
if (outcome === "success") {
  console.log(`::notice title=${esc("PASS staging DB · migration replay")}::${esc(`local Supabase started, migrations applied=${applied}`)}`);
} else {
  const lastApplying = [...log.matchAll(/Applying migration ([^\n]+)/g)].pop()?.[1] ?? "?";
  const errIdx = log.search(/ERROR|error:|failed/i);
  const tail = errIdx >= 0 ? log.slice(errIdx, errIdx + 1500) : log.slice(-1500);
  console.log(`::warning title=${esc("FAIL staging DB · migration replay")}::${esc(`applied=${applied} last=${lastApplying}\n${tail}`)}`);
}
