#!/usr/bin/env node
/**
 * Agora / browser-only call SDK must not enter root RSC (app/layout) static import chain.
 * Usage: npm run verify:agora-ssr-isolation-contract
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`verify:agora-ssr-isolation-contract FAIL — ${msg}`);
  process.exit(1);
}

function assertNoMatch(rel, pattern, label) {
  const src = read(rel);
  if (pattern.test(src)) {
    fail(`${rel} — ${label}`);
  }
}

function assertMatch(rel, pattern, label) {
  const src = read(rel);
  if (!pattern.test(src)) {
    fail(`${rel} — ${label}`);
  }
}

// Root layout must not statically import CallIncomingChrome (SSR pulls call subtree).
const layout = read("app/layout.tsx");
if (/from\s+["']@\/components\/layout\/providers\/CallIncomingChrome["']/.test(layout)) {
  fail("app/layout.tsx must import CallIncomingChromeRoot, not CallIncomingChrome");
}
assertMatch(
  "app/layout.tsx",
  /CallIncomingChromeRoot/,
  "app/layout.tsx must mount CallIncomingChromeRoot"
);

assertMatch(
  "components/layout/providers/CallIncomingChromeRoot.tsx",
  /ssr:\s*false/,
  "CallIncomingChromeRoot must dynamic-import CallIncomingChrome with ssr:false"
);

// Prefetch must not top-level import group-agora-session (Agora chain).
assertNoMatch(
  "lib/community-messenger/call-connection-prefetch.ts",
  /^\s*import\s+\{[^}]*fetchGroupAgoraConnection[^}]*\}\s+from\s+["']@\/lib\/community-messenger\/call-provider\/group-agora-session["']/m,
  "call-connection-prefetch must not statically import fetchGroupAgoraConnection"
);
assertNoMatch(
  "lib/community-messenger/call-connection-prefetch.ts",
  /agora-rtc-sdk-ng/,
  "call-connection-prefetch must not reference agora-rtc-sdk-ng"
);
assertMatch(
  "lib/community-messenger/call-connection-prefetch.ts",
  /loadFetchGroupAgoraConnection/,
  "call-connection-prefetch must use load-group-agora-session.client loader"
);

assertMatch(
  "lib/community-messenger/call-provider/load-group-agora-session.client.ts",
  /await import\("@\/lib\/community-messenger\/call-provider\/group-agora-session"\)/,
  "load-group-agora-session.client must dynamic-import group-agora-session"
);

// Shell files on layout path must not statically import Agora SDK.
for (const rel of [
  "components/layout/providers/CallIncomingChromeRoot.tsx",
  "components/layout/providers/CallIncomingChrome.tsx",
  "components/layout/providers/DibayFcmCallRouteHost.tsx",
  "lib/community-messenger/incoming-call-accept-gateway.ts",
]) {
  assertNoMatch(rel, /from\s+["']agora-rtc-sdk-ng["']/, "must not statically import agora-rtc-sdk-ng");
  assertNoMatch(
    rel,
    /from\s+["']@\/lib\/community-messenger\/call-provider\/group-agora-session["']/,
    "must not statically import group-agora-session"
  );
}

console.log("verify:agora-ssr-isolation-contract PASS");
