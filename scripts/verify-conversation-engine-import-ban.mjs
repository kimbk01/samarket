#!/usr/bin/env node
/**
 * Conversation engine import ban — new engine must not import quarantined legacy list writers.
 * Also locks cutover flag + product paint wiring markers.
 * @see docs/community-messenger/conversation-engine-legacy-inventory.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = path.join(ROOT, "lib/community-messenger/conversation-engine");

const QUARANTINE_IMPORT_PATTERNS = [
  /from ["']@\/lib\/community-messenger\/home-list-patch/,
  /from ["']@\/lib\/community-messenger\/home\/patch-bootstrap-room-list-from-realtime-message/,
  /from ["']@\/lib\/community-messenger\/home\/home-room-live-patch-from-realtime/,
  /from ["']@\/lib\/community-messenger\/home\/use-community-messenger-home-realtime-bootstrap-list/,
  /from ["']@\/lib\/community-messenger\/dev\/cm-raf-home-list-patch/,
  /from ["']@\/lib\/community-messenger\/home\/bootstrap-cache-bus-writer/,
  /\bapplyHomeListPatch\b/,
  /\bpatchBootstrapRoomList/,
  /\bpostCommunityMessengerCallStubPreviewBusEvent\b/,
  /cm\.room\.call_stub_preview/,
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

let failed = false;
function fail(msg) {
  console.error(`[verify:conversation-engine-import-ban] FAIL ${msg}`);
  failed = true;
}

if (!fs.existsSync(ENGINE_DIR)) {
  fail("conversation-engine directory missing");
  process.exit(1);
}

for (const file of walk(ENGINE_DIR)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  for (const re of QUARANTINE_IMPORT_PATTERNS) {
    if (re.test(text)) {
      fail(`${rel} imports quarantined symbol matching ${re}`);
    }
  }
}

const flagsPath = path.join(ENGINE_DIR, "flags.ts");
if (!fs.existsSync(flagsPath)) {
  fail("flags.ts missing");
} else {
  const flags = fs.readFileSync(flagsPath, "utf8");
  if (!/CONVERSATION_ENGINE_PRODUCT_PAINT\s*=\s*true/.test(flags)) {
    fail("CONVERSATION_ENGINE_PRODUCT_PAINT must be true after cutover");
  }
}

const homePath = path.join(ROOT, "components/community-messenger/CommunityMessengerHome.tsx");
const homeText = fs.readFileSync(homePath, "utf8");
if (!/useConversationEngineHomePaint/.test(homeText)) {
  fail("CommunityMessengerHome must paint via useConversationEngineHomePaint");
}

const listHookPath = path.join(
  ROOT,
  "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts"
);
const listHookText = fs.readFileSync(listHookPath, "utf8");
if (!/CONVERSATION_ENGINE_PRODUCT_PAINT/.test(listHookText)) {
  fail("realtime bootstrap list must gate tip writes on CONVERSATION_ENGINE_PRODUCT_PAINT");
}
if (!/applyConversationEngineMessageInsert/.test(listHookText)) {
  fail("realtime bootstrap list must route inserts to conversation engine");
}

const inventory = path.join(ROOT, "docs/community-messenger/conversation-engine-legacy-inventory.md");
const authority = path.join(ROOT, "docs/community-messenger/conversation-engine-authority.md");
if (!fs.existsSync(inventory)) fail("legacy inventory doc missing");
if (!fs.existsSync(authority)) fail("authority doc missing");

if (failed) process.exit(1);
console.log("[verify:conversation-engine-import-ban] OK");
