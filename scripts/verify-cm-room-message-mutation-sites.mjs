#!/usr/bin/env node
/**
 * CM room `roomMessages` mutation site allowlist.
 * 정본: docs/chat-room-scroll-authority-redesign-plan.md §4 Phase A/C
 *
 * `messenger-room-scroll-anchor-controller.ts` 는 `roomMessages` 배열의 head/tail id 변화를
 * 제네릭하게 감시해(prevHeadMessageIdRef/prevTailMessageIdRef) append 는 auto-scroll 정책으로,
 * head 변화(silent backfill/trim 등)는 `engine.notifyLayoutResize` 재확인으로 흡수한다.
 * 즉 "어디서 `setRoomMessages` 를 호출하는가"와 무관하게 스크롤 앵커는 항상 지켜지지만,
 * 그 전제(제네릭 감시 effect)가 깨지지 않았는지 + 새 mutation 지점이 이 계약을 인지하지 못한 채
 * 추가되지 않았는지를 이 스크립트가 정적으로 확인한다.
 *
 * 새 파일에서 `setRoomMessages(` 를 호출해야 한다면:
 *   1. 아래 ALLOWLIST 에 파일을 추가하고,
 *   2. head/tail 앵커 감시 effect(컨트롤러)가 여전히 커버하는지 확인 후,
 *   3. docs/chat-thread-scroll-contract.md 변경 이력에 근거를 남긴다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

/** 정본 화이트리스트 — roomMessages 를 직접 mutate 하는 것으로 확인된 파일 (2026-07-28 Phase A 조사) */
const ALLOWLIST = new Set([
  "lib/community-messenger/room/use-messenger-room-client-phase1.ts",
  "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts",
  "lib/community-messenger/room/messenger-room-bootstrap-refresh.ts",
  "lib/community-messenger/room/use-messenger-room-load-older-messages-fetch.ts",
  "lib/community-messenger/room/use-messenger-room-voice-recording.ts",
  "lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts",
  "lib/community-messenger/room/use-messenger-room-remote-catchup.ts",
  "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts",
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx",
]);

const SCAN_DIRS = ["lib/community-messenger", "components/community-messenger"];
const SKIP_DIR_NAMES = new Set(["node_modules", "__tests__", ".git"]);

function walk(dirRel, out) {
  const dirAbs = join(root, dirRel);
  if (!existsSync(dirAbs)) return;
  for (const entry of readdirSync(dirAbs)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const entryRel = join(dirRel, entry);
    const entryAbs = join(root, entryRel);
    const st = statSync(entryAbs);
    if (st.isDirectory()) {
      walk(entryRel, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(entryRel);
    }
  }
}

const files = [];
for (const dir of SCAN_DIRS) walk(dir, files);

const foundSites = new Set();
for (const fileRel of files) {
  const normalized = relative(root, join(root, fileRel)).split("\\").join("/");
  const src = read(normalized);
  if (!src.includes("setRoomMessages(")) continue;
  foundSites.add(normalized);
  if (!ALLOWLIST.has(normalized)) {
    errors.push(
      `${normalized}: calls setRoomMessages(...) but is not in the Phase A allowlist — ` +
        `add to scripts/verify-cm-room-message-mutation-sites.mjs ALLOWLIST after confirming ` +
        `messenger-room-scroll-anchor-controller.ts head/tail watchers cover this mutation (see docs/chat-room-scroll-authority-redesign-plan.md §4)`
    );
  }
}

/** 화이트리스트에 있지만 실제로는 더 이상 setRoomMessages 를 안 쓰는 파일 — 표류 항목 방지 */
for (const allowed of ALLOWLIST) {
  if (!foundSites.has(allowed)) {
    errors.push(`${allowed}: allowlisted but no longer calls setRoomMessages(...) — remove stale entry`);
  }
}

/** 제네릭 head/tail 앵커 감시 effect 존재 보장 — Phase A 전제 조건 */
const controller = read("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) errors.push(`${context}: missing "${needle}"`);
}
assertIncludes(controller, "prevTailMessageIdRef", "scroll-anchor-controller tail watcher");
assertIncludes(controller, "prevHeadMessageIdRef", "scroll-anchor-controller head watcher (Phase A premise)");
assertIncludes(controller, "engine.notifyLayoutResize(buildCtx())", "scroll-anchor-controller head watcher re-anchors via engine");

if (errors.length > 0) {
  console.error("verify:cm-room-message-mutation-sites FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `verify:cm-room-message-mutation-sites PASS (${foundSites.size} known roomMessages mutation sites, head/tail watcher premise intact)`
);
