#!/usr/bin/env node
/**
 * Room Message Authority — structural locks.
 * FAIL if prod room timeline writers bypass message-authority.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

let failed = false;
function fail(msg) {
  console.error(`[verify-room-message-authority] FAIL ${msg}`);
  failed = true;
}

const authorityDir = "lib/community-messenger/room/message-authority";
if (!fs.existsSync(path.join(ROOT, authorityDir, "message-authority.ts"))) {
  fail("message-authority.ts missing");
}
if (!fs.existsSync(path.join(ROOT, authorityDir, "room-message-store.ts"))) {
  fail("room-message-store.ts missing");
}

const storeSrc = read(`${authorityDir}/room-message-store.ts`);
if (/export function storeReplaceAll|replaceAllMessages|setMessages\s*\(/.test(storeSrc)) {
  fail("room-message-store must not expose full replace");
}
if (!/seedOnce|storeSeedOnce/.test(storeSrc)) fail("missing seedOnce");

const authSrc = read(`${authorityDir}/message-authority.ts`);
if (!/authorityApplyRealtime/.test(authSrc)) fail("missing authorityApplyRealtime");
if (!/authorityApplyCatchUp/.test(authSrc)) fail("missing authorityApplyCatchUp");
if (!/authoritySeedBootstrap/.test(authSrc)) fail("missing authoritySeedBootstrap");

/** Ingest must not rAF-batch message writes */
{
  const file = "lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts";
  const text = read(file);
  if (/realtimeBatchFlushRafRef|requestAnimationFrame\(\s*\(\)\s*=>\s*\{\s*flushRealtimeMessageBatch/.test(text)) {
    fail(`${file}: rAF message batch must be removed`);
  }
  if (!/authorityApplyRealtime/.test(text)) fail(`${file}: must call authorityApplyRealtime`);
  if (/setRoomMessages\s*\(/.test(text)) fail(`${file}: must not setRoomMessages`);
}

/** Catch-up must use authority */
{
  const file = "lib/community-messenger/room/use-messenger-room-remote-catchup.ts";
  const text = read(file);
  if (!/authorityApplyCatchUp/.test(text)) fail(`${file}: must call authorityApplyCatchUp`);
  if (/setRoomMessages\s*\(/.test(text)) fail(`${file}: must not setRoomMessages`);
  if (/mergeRoomMessages\s*\(/.test(text)) fail(`${file}: must not mergeRoomMessages into React state`);
}

/** Phase1 / home bus must not dual-write room timeline */
{
  const file = "lib/community-messenger/stores/messenger-realtime-store.ts";
  const text = read(file);
  const applyIdx = text.indexOf("applyIncomingMessageEvent: (input) =>");
  if (applyIdx < 0) {
    fail(`${file}: applyIncomingMessageEvent implementation missing`);
  } else {
    const slice = text.slice(applyIdx, applyIdx + 4500);
    if (/authorityApplyRealtime\s*\(/.test(slice)) {
      fail(`${file}: applyIncomingMessageEvent must not call authorityApplyRealtime (dual ingress)`);
    }
  }
  if (!/\[rid\]:\s*\[fallbackMessage\]/.test(text)) {
    fail(`${file}: applyIncomingMessageEvent must keep lightweight list tip projection`);
  }
}

/** Phase1 must subscribe authority, not own useState writers for timeline */
{
  const file = "lib/community-messenger/room/use-messenger-room-client-phase1.ts";
  const text = read(file);
  if (!/useRoomMessagesFromAuthority|authorityGetMessages|getRoomMessagesArray/.test(text)) {
    fail(`${file}: must read timeline from authority store`);
  }
}

if (failed) process.exit(1);
console.log("[verify-room-message-authority] OK");
