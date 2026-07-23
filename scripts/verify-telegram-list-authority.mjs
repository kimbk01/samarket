#!/usr/bin/env node
/**
 * Telegram list authority — structural locks.
 * FAIL on: remount silent, dual-write, TTL Gate remount, raw hub list mutate outside applyHomeListPatch,
 * cross-surface paint imports, QUARANTINED no-op resurrection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".qa-logs") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function rel(abs) {
  return path.relative(ROOT, abs);
}

let failed = false;
function fail(msg) {
  console.error(`[verify-telegram-list-authority] FAIL ${msg}`);
  failed = true;
}

/** Deleted dual-write must not exist and must not be imported. */
const dualWritePath = path.join(ROOT, "lib/chat-domain/list/dual-write-domain-list-from-rooms.ts");
if (fs.existsSync(dualWritePath)) {
  fail("dual-write-domain-list-from-rooms.ts must be deleted (not QUARANTINED no-op)");
}

const PROD_ROOTS = [
  path.join(ROOT, "lib"),
  path.join(ROOT, "components"),
  path.join(ROOT, "app"),
];

const prodSrc = PROD_ROOTS.flatMap((d) => walk(d)).filter(
  (f) => !f.includes(`${path.sep}__tests__${path.sep}`) && !f.includes(".test.")
);

for (const file of prodSrc) {
  const text = fs.readFileSync(file, "utf8");
  const r = rel(file);
  if (/dual-write-domain-list-from-rooms|dualWriteDomainListProjectionsFromRooms/.test(text)) {
    fail(`forbidden dual-write symbol in production ${r}`);
  }
  if (/QUARANTINED \(Telegram list authority/.test(text) && /return \{\s*byDomain:/.test(text)) {
    fail(`QUARANTINED no-op writer resurrected in ${r}`);
  }
}

/** Hub remount lock */
{
  const file = "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/messenger:stale-resume-silent/.test(text)) fail(`${file}: stale-resume-silent remount path`);
  if (!/Telegram list authority/.test(text)) fail(`${file}: missing telegram remount lock comment`);
  if (!/if \(memoryFresh\)/.test(text)) fail(`${file}: missing memoryFresh early return`);
  if (!/messenger_home_silent_skip_hydrated_list/.test(text)) {
    fail(`${file}: missing silent skip when hydrated list`);
  }
  if (/tryClaimInitialForegroundBootstrap|samarket:cm:initial-foreground-bootstrap/.test(text)) {
    fail(`${file}: initial-foreground claim must stay deleted`);
  }
}

/** Home: no social_sync → refresh(true); product paint forced legacy */
{
  const file = "components/community-messenger/CommunityMessengerHome.tsx";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/cm\.home\.social_sync[\s\S]{0,200}refresh\(true\)/.test(text)) {
    fail(`${file}: social_sync must not call refresh(true)`);
  }
  if (!/hydrateMessengerFriends\(\)/.test(text)) fail(`${file}: social path must hydrate friends`);
  if (!/source:\s*"legacy"/.test(text)) fail(`${file}: product list must force source legacy`);
}

/** Host bus writer: viewer null must not clearBootstrapCache */
{
  const file = "lib/community-messenger/home/bootstrap-cache-bus-writer.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const start = text.indexOf("export function noteBootstrapCacheBusWriterViewerUserId");
  if (start < 0) fail(`${file}: missing noteBootstrapCacheBusWriterViewerUserId`);
  else {
    const slice = text.slice(start, start + 900);
    if (/clearBootstrapCache\s*\(/.test(slice)) {
      fail(`${file}: noteBootstrapCacheBusWriterViewerUserId must not call clearBootstrapCache()`);
    }
  }
}

/** home-list-patch sole hub reducer + domain leak strip */
{
  const file = "lib/community-messenger/home-list-patch.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/dualWriteDomainListProjectionsFromRooms\s*\(/.test(text)) {
    fail(`${file}: dual-write call`);
  }
  if (!/stripCommerceDomainRowsFromHubLists/.test(text)) fail(`${file}: missing domain leak strip`);
  if (!/function applyLocalUnreadToLists/.test(text)) fail(`${file}: missing applyLocalUnreadToLists`);
  /** regression: hit must be set inside map before early return */
  const fn = text.slice(text.indexOf("function applyLocalUnreadToLists"));
  const earlyHit = /const patchRooms[\s\S]*?if \(!hit\) return[\s\S]*?const nextChats = patchRooms/.test(fn);
  if (earlyHit) fail(`${file}: applyLocalUnreadToLists hit-before-map regression`);
}

/** Domain Gate: hydrated peek → no TTL remount fetch */
for (const [file, freshSym, peekSym] of [
  [
    "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
    "isDomainTradeListCanaryCacheFresh",
    "peekDomainTradeListCanaryCache(syncUid)",
  ],
  [
    "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    "isDomainStoreOrderCustomerListCanaryCacheFresh",
    "peekDomainStoreOrderCustomerListCanaryCache(syncUid)",
  ],
]) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (text.includes(freshSym)) fail(`${file}: TTL remount gate ${freshSym}`);
  if (!text.includes(peekSym)) fail(`${file}: missing hydrated peek ${peekSym}`);
}

/** Prefetch miss-only */
{
  const file = "components/community-messenger/domain-shell-canary/domain-list-canary-hub-prefetch.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/Always revalidate/.test(text)) fail(`${file}: always-revalidate`);
  if (!/if \(peekDomainTradeListCanaryCache\(uid\)\) return Promise\.resolve\(\)/.test(text)) {
    fail(`${file}: prefetch miss-only trade`);
  }
}

/** TTL remount helpers must stay deleted */
for (const [file, deadSym] of [
  ["components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache.ts", "isDomainTradeListCanaryCacheFresh"],
  [
    "components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache.ts",
    "isDomainStoreOrderCustomerListCanaryCacheFresh",
  ],
]) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (text.includes(deadSym)) fail(`${file}: dead TTL helper ${deadSym} must stay deleted`);
}

/** Tablet split trade/delivery must paint canary, not hub pillar */
{
  const file = "components/community-messenger/MessengerSplitListPane.tsx";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (!/MessengerPillarChatsSegment/.test(text)) {
    fail(`${file}: trade/delivery split must use MessengerPillarChatsSegment`);
  }
  if (/pillar=\{pillar\}/.test(text) || /pillar=\{scopeToPillar/.test(text)) {
    fail(`${file}: must not pass commerce pillar into CommunityMessengerHome`);
  }
}

/** Domain spine hub mirror must use applyHomeListPatch (no raw patchBootstrapRoomList) */
{
  const file = "lib/community-messenger/realtime/domain-room-state-store.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/patchBootstrapRoomListForRealtimeMessageInsert|patchBootstrapRoomListForSenderLocalEcho/.test(text)) {
    fail(`${file}: raw patchBootstrapRoomList bypasses applyHomeListPatch`);
  }
  if (!/applyHomeListPatch/.test(text)) fail(`${file}: mirror must call applyHomeListPatch`);
  if (/chats:\s*\([\s\S]{0,80}\)\.map\(/.test(text) && /unreadCount: room\.unreadCount/.test(text)) {
    fail(`${file}: raw chats.map unread mutation`);
  }
}

/** Cross-surface: CM home bootstrap must not import Domain canary paint primes as truth overwrite */
{
  const file = "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/primeDomainTradeListCanaryCache|primeDomainStoreOrderCustomerListCanaryCache/.test(text)) {
    fail(`${file}: CM bootstrap must not write Domain canary paint store`);
  }
}

/** Cross-surface: Domain canary patch must not import applyHomeListPatch as trade/SO authority */
{
  const file =
    "components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch.ts";
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/applyHomeListPatch/.test(text)) {
    fail(`${file}: Domain canary must not mutate hub via applyHomeListPatch`);
  }
}

if (failed) process.exit(1);
console.log("[verify-telegram-list-authority] OK");
