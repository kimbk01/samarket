#!/usr/bin/env node
/** Bottom tabs share (main) MainAppProviders — no storesHub remount layout. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
let failed = false;

function fail(msg) {
  failed = true;
  console.error(`verify:no-tab-provider-remount: ${msg}`);
}

if (fs.existsSync(path.join(ROOT, "app/(stores)"))) {
  fail("app/(stores) must not exist (Provider remount on /stores)");
}

const mainLayout = fs.readFileSync(path.join(ROOT, "app/(main)/layout.tsx"), "utf8");
if (!mainLayout.includes("MainAppProviders")) {
  fail("(main)/layout must use MainAppProviders");
}

const pushSession = fs.readFileSync(path.join(ROOT, "lib/navigation/main-shell-push-session.ts"), "utf8");
if (!/isCrossMainShellRouteGroup[\s\S]*return false/.test(pushSession)) {
  fail("isCrossMainShellRouteGroup must return false");
}

if (failed) process.exit(1);
console.log("verify:no-tab-provider-remount: ok");
