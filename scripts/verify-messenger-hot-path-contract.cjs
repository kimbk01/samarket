/**
 * Community 메신저 핫패스 계약 — 카톡/텔레 구조 회귀 탐지.
 * 규칙: docs/messenger-performance-architecture.md §11 (MP-AUDIT lock)
 *
 * 사용: npm run verify:messenger-hot-path-contract
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** `export async function NAME … ) {` 본문 — 제네릭 `<{` 는 시그니처 밖으로 제외 */
function extractAsyncExportBody(source, fnName) {
  const marker = `export async function ${fnName}`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const openIdx = source.indexOf("\n) {", start);
  if (openIdx < 0) return null;
  let depth = 0;
  let opened = false;
  const bodyOpen = openIdx + "\n) {".length - 1;
  for (let i = bodyOpen; i < source.length; i++) {
    const c = source[i];
    if (c === "{") {
      depth++;
      opened = true;
    } else if (c === "}") {
      depth--;
      if (opened && depth === 0) {
        return source.slice(bodyOpen, i + 1);
      }
    }
  }
  return null;
}

function extractInnerFunctionBody(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const openIdx = source.indexOf("{", start + marker.length);
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  return null;
}

let failed = false;

function fail(msg) {
  console.error(`verify-messenger-hot-path-contract: ${msg}`);
  failed = true;
}

// 1) 텍스트 전송 POST — 수신 bump 는 ACK 전, 무거운 postAckEffects 는 after()
const messagesRoute = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
const postBody = extractAsyncExportBody(messagesRoute, "POST");
if (!postBody) {
  fail("POST handler not found in messages/route.ts");
} else {
  const afterIdx = postBody.indexOf("after(async");
  const bumpAwaitIdx = postBody.indexOf("await publishMessengerRoomBumpAfterMutation");
  if (afterIdx < 0) {
    fail("POST .../messages must keep after(async …) for postAckEffects");
  }
  if (bumpAwaitIdx < 0) {
    fail("POST .../messages must await publishMessengerRoomBumpAfterMutation before ACK");
  } else if (afterIdx >= 0 && bumpAwaitIdx > afterIdx) {
    fail("POST .../messages must not defer publishMessengerRoomBumpAfterMutation inside after()");
  }
  if (!postBody.includes("membershipPreflightDone: true")) {
    fail("POST .../messages must pass membershipPreflightDone: true to sendCommunityMessengerMessage");
  }
  if (!postBody.includes("messengerRoomCanonicalOrJsonError")) {
    fail("POST .../messages must resolve room via messengerRoomCanonicalOrJsonError");
  }
}

// 2) atomic send — RPC 전 trade exit 스냅샷 조회 금지 (MP-AUDIT-4)
const service = read("lib/community-messenger/service.ts");
const atomicBody = extractInnerFunctionBody(service, "async function trySendCommunityMessengerTextAtomic");
if (!atomicBody) {
  fail("trySendCommunityMessengerTextAtomic not found");
} else if (atomicBody.includes("loadTradeProductChatExitSnapshotForMessengerRoom")) {
  fail(
    "loadTradeProductChatExitSnapshotForMessengerRoom must not appear inside trySendCommunityMessengerTextAtomic (RPC 가드 단일화)"
  );
} else if (atomicBody.includes("notifyCommunityChatInAppForRecipients")) {
  fail(
    "notifyCommunityChatInAppForRecipients must not run inside trySendCommunityMessengerTextAtomic (MP-AUDIT-14 after() defer)"
  );
} else if (atomicBody.includes("invalidateOwnerHubBadgeForCommunityMessengerPeers")) {
  fail(
    "invalidateOwnerHubBadgeForCommunityMessengerPeers must not run inside trySendCommunityMessengerTextAtomic (MP-AUDIT-14 after() defer)"
  );
}

// 2b) POST — postAckEffects 는 after() 에서만 실행
if (postBody && !postBody.includes("runCommunityMessengerSendPostAckEffects")) {
  fail("POST .../messages must defer postAckEffects via runCommunityMessengerSendPostAckEffects in after()");
}
if (postBody) {
  const afterIdx = postBody.indexOf("after(async");
  const effectsIdx = postBody.indexOf("runCommunityMessengerSendPostAckEffects");
  if (effectsIdx >= 0 && afterIdx >= 0 && effectsIdx < afterIdx) {
    fail("POST .../messages must not run postAckEffects before after()");
  }
}

// 2c) 그룹 CM 전송도 일반 CM 과 동일하게 수신 bump 는 ACK 전
const groupMessagesRoute = read("app/api/community-messenger/group-rooms/[roomId]/messages/route.ts");
const groupPostBody = extractAsyncExportBody(groupMessagesRoute, "POST");
if (!groupPostBody) {
  fail("POST handler not found in group-rooms/[roomId]/messages/route.ts");
} else {
  const afterIdx = groupPostBody.indexOf("after(async");
  const bumpAwaitIdx = groupPostBody.indexOf("await publishMessengerRoomBumpAfterMutation");
  if (afterIdx < 0) {
    fail("POST .../group-rooms/messages must keep after(async …) for postAckEffects");
  }
  if (bumpAwaitIdx < 0) {
    fail("POST .../group-rooms/messages must await publishMessengerRoomBumpAfterMutation before ACK");
  } else if (afterIdx >= 0 && bumpAwaitIdx > afterIdx) {
    fail("POST .../group-rooms/messages must not defer publishMessengerRoomBumpAfterMutation inside after()");
  }
}

// 3) 홈 bootstrap 클라 fetch — AbortSignal 이 있어도 single-flight 합류
const cmBootstrapFetch = read("lib/community-messenger/cm-bootstrap-client-fetch.ts");
if (!cmBootstrapFetch.includes("getSingleFlightPromise")) {
  fail("cm-bootstrap-client-fetch must join inflight via getSingleFlightPromise before runSingleFlight");
}
if (/if\s*\(\s*signal\s*\)/.test(cmBootstrapFetch) && cmBootstrapFetch.includes("runSingleFlight") && !cmBootstrapFetch.includes("joinBootstrapSingleFlight")) {
  fail("cm-bootstrap-client-fetch must route through joinBootstrapSingleFlight (signal bypass 금지)");
}

// 4) full 캐시 hit 시 deferred lite 스킵
const homeBootstrap = read("lib/community-messenger/home/use-community-messenger-home-bootstrap.ts");
if (!homeBootstrap.includes("staleFullOnly")) {
  fail("use-community-messenger-home-bootstrap must keep staleFullOnly fast path");
}
if (!homeBootstrap.includes("samarket:messenger-home-warm-cache-ready")) {
  fail("use-community-messenger-home-bootstrap must listen for warm-cache-ready promotion");
}

// 5) room bootstrap — list_prefetch 와 block 경합 합류
const roomBootstrapRefresh = read("lib/community-messenger/room/messenger-room-bootstrap-refresh.ts");
if (!roomBootstrapRefresh.includes("wasRoomPrefetchRecentlySuccessful")) {
  fail("messenger-room-bootstrap-refresh must use wasRoomPrefetchRecentlySuccessful for skip/join");
}
if (!roomBootstrapRefresh.includes("getSingleFlightPromise")) {
  fail("messenger-room-bootstrap-refresh must join prefetch single-flight via getSingleFlightPromise");
}

// 6) display_ready — 4s 인위 fallback 금지 (MP-AUDIT-9)
const r6DisplayReady = read("lib/community-messenger/room/cm-room-r6-display-ready-instrumentation.ts");
if (/setTimeout\([^)]*4_?000/.test(r6DisplayReady)) {
  fail("scheduleCmRoomTimelineHeavyReadyAfterDom must not use 4000ms display_ready fallback");
}
if (!r6DisplayReady.includes("CM_ROOM_DISPLAY_READY_HEAVY_FALLBACK_MS")) {
  fail("cm-room-r6-display-ready must define CM_ROOM_DISPLAY_READY_HEAVY_FALLBACK_MS short fallback");
}

if (failed) {
  console.error(
    "→ 의도적 변경이면 docs/messenger-performance-architecture.md §11 과 본 스크립트 금지 목록을 함께 갱신하세요."
  );
  process.exit(1);
}

console.log("verify-messenger-hot-path-contract: ok");
