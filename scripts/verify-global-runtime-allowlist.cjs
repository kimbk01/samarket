/**
 * Root app/layout.tsx runtime hosts must stay on an explicit allowlist.
 * New always-mounted bridges require updating this allowlist intentionally.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const layout = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");

/** GLOBAL_REQUIRED hosts currently permitted in root body (exact JSX tags). */
const ALLOWED = new Set([
  "AppLanguageProvider",
  "AppBootProvider",
  "AppTitle",
  "SupabaseAuthSync",
  "CapacitorNativeMarkerBootstrap",
  "OAuthReturnListener",
  "CallIncomingChromeRoot",
  "DeferredMainShellMessengerParticipantBridge",
]);

const tagRe = /<([A-Z][A-Za-z0-9]*)\b/g;
const found = new Set();
let m;
while ((m = tagRe.exec(layout))) {
  found.add(m[1]);
}

const failures = [];
for (const tag of found) {
  if (!ALLOWED.has(tag) && tag !== "html" && tag !== "head" && tag !== "body" && tag !== "link") {
    // ignore lowercase html; already filtered by [A-Z]
    if (["Fragment"].includes(tag)) continue;
    failures.push(`unexpected root host <${tag}> — update allowlist only with product approval`);
  }
}
for (const need of ["CallIncomingChromeRoot", "DeferredMainShellMessengerParticipantBridge"]) {
  if (!found.has(need)) failures.push(`missing required global host ${need}`);
}

if (failures.length) {
  console.error("[verify:global-runtime-allowlist] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:global-runtime-allowlist] OK — root hosts match allowlist");
