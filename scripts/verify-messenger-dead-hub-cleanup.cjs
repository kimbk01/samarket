#!/usr/bin/env node
/**
 * R2-M3 — dead hub store/files must not return.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const DEAD_FILES = [
  "lib/community-messenger/stores/useChatStore.ts",
  "lib/community-messenger/chat-store-from-server.ts",
];

const FORBIDDEN_IMPORTS = [
  { re: /from\s+["']@\/lib\/community-messenger\/stores\/useChatStore["']/, label: "useChatStore import" },
  { re: /from\s+["']@\/lib\/community-messenger\/chat-store-from-server["']/, label: "chat-store-from-server import" },
  { re: /\buseChatStore\s*\(/, label: "useChatStore() call" },
  { re: /\bchatStoreRoomsFromSummaries\s*\(/, label: "chatStoreRoomsFromSummaries() call" },
  { re: /\bgetMessengerRealtimeRoomSummary\s*\(/, label: "getMessengerRealtimeRoomSummary() call" },
  { re: /\bapplyRoomSummaryPatched\s*\(/, label: "applyRoomSummaryPatched() call" },
  { re: /\bapplyRoomReadEvent\s*\(/, label: "applyRoomReadEvent() call" },
  { re: /\bseedMessengerRealtimeFromBootstrap\s*\(/, label: "seedMessengerRealtimeFromBootstrap() call" },
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "dist") continue;
      walk(abs, out);
    } else if (/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(ent.name)) {
      out.push(abs);
    }
  }
  return out;
}

let failed = false;

for (const rel of DEAD_FILES) {
  if (fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[verify-messenger-dead-hub-cleanup] FAIL: dead file still exists: ${rel}`);
    failed = true;
  }
}

const srcRoot = path.join(ROOT, "lib");
const componentRoot = path.join(ROOT, "components");
const files = [...walk(srcRoot), ...walk(componentRoot)];

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  if (rel.startsWith("lib/community-messenger/stores/__tests__")) continue;
  const text = fs.readFileSync(abs, "utf8");
  for (const rule of FORBIDDEN_IMPORTS) {
    if (rule.label.includes("applyRoomSummaryPatched") || rule.label.includes("applyRoomReadEvent")) {
      if (rel === "lib/community-messenger/realtime/messenger-realtime-snapshot-runtime.ts") continue;
    }
    if (rule.re.test(text)) {
      console.error(`[verify-messenger-dead-hub-cleanup] FAIL ${rel}: ${rule.label}`);
      failed = true;
    }
  }
}

const indexPath = path.join(ROOT, "lib/community-messenger/stores/index.ts");
if (fs.existsSync(indexPath)) {
  const indexText = fs.readFileSync(indexPath, "utf8");
  if (indexText.includes("useChatStore")) {
    console.error("[verify-messenger-dead-hub-cleanup] FAIL: stores/index.ts still exports useChatStore");
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("[verify-messenger-dead-hub-cleanup] OK — dead hub store files and forbidden symbols absent");
