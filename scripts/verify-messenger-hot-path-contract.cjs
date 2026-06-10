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

// 1) 텍스트 전송 POST — bump 는 after() (ACK 에 합산 금지)
const messagesRoute = read("app/api/community-messenger/rooms/[roomId]/messages/route.ts");
const postBody = extractAsyncExportBody(messagesRoute, "POST");
if (!postBody) {
  fail("POST handler not found in messages/route.ts");
} else {
  if (!postBody.includes("after(async")) {
    fail("POST .../messages must defer bump via after(async …)");
  }
  const bumpAwaitOutsideAfter =
    /await\s+publishMessengerRoomBumpAfterMutation/.test(postBody) &&
    !/after\s*\(\s*async[\s\S]*await\s+publishMessengerRoomBumpAfterMutation/.test(postBody);
  if (bumpAwaitOutsideAfter) {
    fail("POST .../messages must not await publishMessengerRoomBumpAfterMutation before jsonOk response");
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

if (failed) {
  console.error(
    "→ 의도적 변경이면 docs/messenger-performance-architecture.md §11 과 본 스크립트 금지 목록을 함께 갱신하세요."
  );
  process.exit(1);
}

console.log("verify-messenger-hot-path-contract: ok");
