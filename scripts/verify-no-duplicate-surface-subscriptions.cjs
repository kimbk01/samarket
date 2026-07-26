#!/usr/bin/env node
/**
 * Structural: Domain realtime host at root; messenger home must not clear bootstrap on leave incorrectly.
 * Full runtime channel-count needs device — this gate locks known duplicate-writer anti-patterns.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  failed = true;
  console.error(`verify:no-duplicate-surface-subscriptions: ${msg}`);
}

const rootLayout = read("app/layout.tsx");
if (!rootLayout.includes("DeferredMainShellMessengerParticipantBridge")) {
  fail("root layout must mount DeferredMainShellMessengerParticipantBridge (global authority)");
}

const bus = read("lib/community-messenger/home/bootstrap-cache-bus-writer.ts");
{
  const noteFn = bus.slice(bus.indexOf("noteBootstrapCacheBusWriterViewerUserId"));
  const slice = noteFn.slice(0, 900);
  if (/clearBootstrapCache\s*\(/.test(slice)) {
    fail("bootstrap bus writer must not clearBootstrapCache on viewer note/null (tab leave)");
  }
}

const transition = read("components/layout/MainShellTabContentTransition.tsx");
if (transition.includes("DeferredMainTabEnterPanel")) {
  fail("DeferredMainTabEnterPanel remount pattern removed");
}
if (/\bfunction\s+InstantMainTabEnterPanel\b/.test(transition) || /\bTradeMarketTabPushEnterPanel\b/.test(transition)) {
  fail("InstantMainTabEnterPanel temporary Surface removed — route children only");
}
if (transition.includes("MainTabSurfaceKeepAlive") || fs.existsSync(path.join(ROOT, "components/layout/MainTabSurfaceKeepAlive.tsx"))) {
  fail("MainTabSurfaceKeepAlive removed — caused bottom-nav URL hijack");
}

if (failed) process.exit(1);
console.log("verify:no-duplicate-surface-subscriptions: ok");
