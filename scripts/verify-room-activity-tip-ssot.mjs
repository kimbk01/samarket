#!/usr/bin/env node
/**
 * Room Activity tip SSOT — after PRODUCT PASS, hub tip authority is only
 * projectRoomActivityToHomeList (via applyIncomingMessageEvent / projection helpers).
 *
 * FAIL on:
 * - Conversation Engine / ConversationStore product modules
 * - dual-write tip revival
 * - Home UPDATE/TIP batches that author tip via applyHomeListPatch kinds directly
 * - Domain soft bump mirroring hub tip
 * - Dial seed must not publish mid-call tip (Native ringing authority; terminal-only history)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = false;
function fail(msg) {
  console.error(`[verify-room-activity-tip-ssot] FAIL ${msg}`);
  failed = true;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/** Conversation Engine must stay deleted. */
for (const rel of [
  "lib/community-messenger/conversation-engine",
  "lib/community-messenger/conversation-store",
]) {
  if (exists(rel)) fail(`forbidden module tree must stay deleted: ${rel}`);
}

if (exists("lib/chat-domain/list/dual-write-domain-list-from-rooms.ts")) {
  fail("dual-write-domain-list-from-rooms.ts must stay deleted");
}

{
  const home = "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts";
  const text = read(home);
  if (!text.includes("projectRoomActivityToHomeList")) {
    fail(`${home}: must route tip through projectRoomActivityToHomeList`);
  }
  if (/kind:\s*"realtime_message_update"/.test(text)) {
    fail(`${home}: must not author tip via realtime_message_update applyHomeListPatch`);
  }
  if (/kind:\s*"room_tip_update"/.test(text)) {
    fail(`${home}: must not author tip via room_tip_update applyHomeListPatch`);
  }
  if (!/applyRealtimeMessageUpdateBatch[\s\S]{0,2500}?projectRoomActivityToHomeList/.test(text)) {
    fail(`${home}: UPDATE batch must call projectRoomActivityToHomeList`);
  }
  if (!/applyRealtimeRoomTipUpdateBatch[\s\S]{0,2500}?projectRoomActivityToHomeList/.test(text)) {
    fail(`${home}: TIP batch must call projectRoomActivityToHomeList`);
  }
}

{
  const domain = "lib/community-messenger/realtime/domain-room-state-store.ts";
  const text = read(domain);
  if (!text.includes("projectRoomActivityToHomeList")) {
    fail(`${domain}: message tip mirror must use projectRoomActivityToHomeList`);
  }
  if (!/dispatchDomainRoomBump[\s\S]{0,900}?mirrorListCache:\s*false/.test(text)) {
    fail(`${domain}: dispatchDomainRoomBump must not mirror hub tip (mirrorListCache:false)`);
  }
}

{
  const seed = "lib/community-messenger/call-session-navigation-seed.ts";
  const text = read(seed);
  // Native ringing authority: no mid-call dial tip / stub preview from navigation seed.
  if (text.includes("postCommunityMessengerCallStubPreviewBusEvent")) {
    fail(`${seed}: must not publish mid-call dial tip via call stub helper`);
  }
  if (text.includes("outgoing_started")) {
    fail(`${seed}: must not publish outgoing_started tip on dial seed`);
  }
  if (/type:\s*"cm\.room\.message_sent"[\s\S]{0,200}?lastMessageType:\s*"call_stub"/.test(text)) {
    fail(`${seed}: must not publish dial tip via raw message_sent listPreview`);
  }
  if (!text.includes("ringing mid-call tip/stub is Native UI only")) {
    fail(`${seed}: must document Native-only mid-call tip contract`);
  }
}

{
  const localAppend = "lib/community-messenger/call-chat-local-append.ts";
  const text = read(localAppend);
  if (!text.includes("postCommunityMessengerCallStubPreviewBusEvent")) {
    fail(`${localAppend}: terminal tip projection via call stub preview bus must exist`);
  }
  if (!text.includes("tipActivityAt") && !text.includes("endedAt")) {
    fail(`${localAppend}: terminal tip must prefer endedAt/tipActivityAt over startedAt-only`);
  }
}

{
  const service = "lib/community-messenger/service.ts";
  const text = read(service);
  if (!text.includes("listActivityAt")) {
    fail(`${service}: terminal stub must bump rooms.last_message_at via listActivityAt`);
  }
  // Regression: replaceExistingStub must not disable terminal list bump.
  if (/bumpRoomLastMessageAt:\s*!input\.replaceExistingStub/.test(text)) {
    fail(`${service}: must not disable terminal bump when replaceExistingStub (dial stub removed)`);
  }
}

{
  const bump = "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts";
  const catchup = "lib/community-messenger/room/use-messenger-room-remote-catchup.ts";
  for (const rel of [bump, catchup]) {
    const text = read(rel);
    if (!text.includes("applyIncomingMessageEvent")) {
      fail(`${rel}: must project tip via applyIncomingMessageEvent SSOT`);
    }
  }
}

{
  const ssot = "lib/community-messenger/home/project-room-activity-to-home-list.ts";
  const text = read(ssot);
  if (!text.includes("Sole tip writer") && !text.includes("projectRoomActivityToHomeList")) {
    fail(`${ssot}: tip SSOT module missing`);
  }
  if (!/DO NOT introduce a new global ConversationStore/.test(text)) {
    fail(`${ssot}: missing ConversationStore ban comment`);
  }
}

if (failed) process.exit(1);
console.log("[verify-room-activity-tip-ssot] OK");
