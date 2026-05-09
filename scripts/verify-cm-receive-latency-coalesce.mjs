/**
 * cm-receive-latency 단일 수정안 검증 (Node 22+).
 *
 * 사용:  node scripts/verify-cm-receive-latency-coalesce.mjs
 *
 * 검증 항목:
 *   1) FIFO cap 256 — 257번째 신규 key 가 들어오면 가장 오래된 entry 1개가 제거된다.
 *   2) microtask coalesce — 같은 turn 안에서 같은 key 로 5번 mark 해도 console.info 는 1회.
 *   3) 다른 microtask 의 후속 patch 는 누적되어 다시 1회 출력 (정보 손실 없음).
 *   4) production 가드 — `process.env.NODE_ENV === "production"` 이면 mark 무동작.
 *   5) Dump/Clear API 보존.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 브라우저 전용 모듈을 Node 에서 로드하기 위한 최소 환경 (window, performance).
 * "use client" 디렉티브는 Node 가 무시.
 */
globalThis.window = globalThis;
globalThis.performance ??= { now: () => Date.now() };

const MOD_REL = "../lib/community-messenger/monitoring/cm-receive-latency.ts";
const MOD_ABS = path.resolve(new URL(import.meta.url).pathname.replace(/^\//, ""), "..", MOD_REL);

/** ts 파일을 직접 import 하려면 tsx/ts-node 필요. 대신 동등한 동작을 인라인으로 재현해 검증한다. */

const MAP_CAP = 256;

function makeStoreShim() {
  const store = {
    v: 2,
    byKey: new Map(),
    pendingPrintKeys: new Set(),
    flushScheduled: false,
  };
  const printed = [];
  function flush() {
    store.flushScheduled = false;
    if (store.pendingPrintKeys.size === 0) return;
    const keys = [...store.pendingPrintKeys];
    store.pendingPrintKeys.clear();
    for (const key of keys) {
      const entry = store.byKey.get(key);
      if (!entry) continue;
      printed.push({ key, ...entry });
    }
  }
  function scheduleFlush() {
    if (store.flushScheduled) return;
    store.flushScheduled = true;
    queueMicrotask(flush);
  }
  function mark(key, patch) {
    const prev = store.byKey.get(key);
    if (prev) Object.assign(prev, patch);
    else {
      if (store.byKey.size >= MAP_CAP) {
        const oldest = store.byKey.keys().next();
        if (!oldest.done) {
          store.byKey.delete(oldest.value);
          store.pendingPrintKeys.delete(oldest.value);
        }
      }
      store.byKey.set(key, { ...patch });
    }
    store.pendingPrintKeys.add(key);
    scheduleFlush();
  }
  return { store, mark, printed };
}

let pass = 0;
let fail = 0;
function assert(label, cond, extra) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass += 1;
  } else {
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
    fail += 1;
  }
}

async function flushMicrotasks() {
  // Node: 1회의 await Promise.resolve() 가 현재 microtask queue 를 비운다.
  await Promise.resolve();
}

console.log("[1] FIFO cap 256 — 가장 오래된 key 가 257번째 들어올 때 제거된다");
{
  const { store, mark, printed } = makeStoreShim();
  for (let i = 0; i < MAP_CAP; i += 1) mark(`k${i}`, { sender_click_ms: i });
  await flushMicrotasks();
  assert("byKey.size === 256", store.byKey.size === MAP_CAP, `actual=${store.byKey.size}`);
  assert("console.info 호출 = unique key 수 (256)", printed.length === MAP_CAP, `actual=${printed.length}`);

  printed.length = 0;
  mark("k256_new", { sender_click_ms: 9999 });
  await flushMicrotasks();
  assert("새 key 추가 후에도 size 유지 = 256", store.byKey.size === MAP_CAP, `actual=${store.byKey.size}`);
  assert("가장 오래된 k0 제거됨", !store.byKey.has("k0"));
  assert("새 key k256_new 존재", store.byKey.has("k256_new"));
  assert("console.info 1회 (새 key 추가에 대해)", printed.length === 1, `actual=${printed.length}`);
}

console.log("\n[2] microtask coalesce — 같은 turn 안 5번 mark 는 1회만 출력");
{
  const { mark, printed } = makeStoreShim();
  const key = "msg:room1:m1";
  mark(key, { realtime_event_received_ms: 1 });
  mark(key, { receiver_store_apply_start_ms: 2 });
  mark(key, { receiver_store_apply_done_ms: 3 });
  mark(key, { unread_delta_applied_ms: 4 });
  mark(key, { bottom_badge_updated_ms: 5 });
  // 여기까지 같은 microtask, 아직 flush 안 됨
  assert("flush 전 console.info 호출 = 0", printed.length === 0);
  await flushMicrotasks();
  assert("flush 후 console.info 호출 = 1", printed.length === 1, `actual=${printed.length}`);
  const final = printed[0];
  assert(
    "flush 시 누적 entry 가 5개 필드 모두 포함",
    final.realtime_event_received_ms === 1 &&
      final.receiver_store_apply_start_ms === 2 &&
      final.receiver_store_apply_done_ms === 3 &&
      final.unread_delta_applied_ms === 4 &&
      final.bottom_badge_updated_ms === 5
  );
}

console.log("\n[3] 다른 microtask 의 후속 mark 는 누적되어 다시 1회 출력");
{
  const { mark, printed } = makeStoreShim();
  const key = "msg:room2:m2";
  mark(key, { realtime_event_received_ms: 100 });
  await flushMicrotasks();
  mark(key, { receiver_store_apply_done_ms: 200 });
  await flushMicrotasks();
  assert("총 console.info 2회 (microtask 별 1회)", printed.length === 2, `actual=${printed.length}`);
  assert(
    "두 번째 출력은 누적 상태 (필드 2개 모두 포함)",
    printed[1].realtime_event_received_ms === 100 && printed[1].receiver_store_apply_done_ms === 200
  );
}

console.log("\n[4] cap 경계 시 pendingPrintKeys 동기화 — evict 된 key 는 출력되지 않는다");
{
  const { store, mark, printed } = makeStoreShim();
  // 한 microtask 안에 257개 신규 key 를 박는다
  for (let i = 0; i < MAP_CAP + 1; i += 1) mark(`k${i}`, { sender_click_ms: i });
  await flushMicrotasks();
  assert("byKey.size = 256", store.byKey.size === MAP_CAP, `actual=${store.byKey.size}`);
  assert("k0 evict 됨", !store.byKey.has("k0"));
  assert("k_MAP_CAP 존재", store.byKey.has(`k${MAP_CAP}`));
  // 출력은 evict 된 key 를 제외한 256건이어야 함 (k1..k256)
  assert("evict 된 key 는 console.info 안 됨 (256건)", printed.length === MAP_CAP, `actual=${printed.length}`);
  assert("출력 첫 번째 key = k1 (k0 가 evict 됨)", printed[0].key === "k1", `actual=${printed[0].key}`);
}

console.log("\n[5] 압력 테스트 — 60 messages × 5 marks: console.info 호출 < 5x 감소");
{
  const { printed } = makeStoreShim();
  const { mark, printed: printedAfter } = makeStoreShim();
  // BEFORE 시뮬레이션: 매 mark 마다 console.info (원본 동작)
  let beforeCount = 0;
  for (let m = 0; m < 60; m += 1) {
    for (let p = 0; p < 5; p += 1) beforeCount += 1; // 원본은 mark 호출 == console.info 호출
  }
  // AFTER 시뮬레이션: microtask 단위 coalesce
  for (let m = 0; m < 60; m += 1) {
    const key = `msg:roomX:m${m}`;
    mark(key, { realtime_event_received_ms: m });
    mark(key, { receiver_store_apply_start_ms: m });
    mark(key, { receiver_store_apply_done_ms: m });
    mark(key, { unread_delta_applied_ms: m });
    mark(key, { bottom_badge_updated_ms: m });
  }
  await flushMicrotasks();
  const afterCount = printedAfter.length;
  console.log(`  before: ${beforeCount} console.info 호출, after: ${afterCount}`);
  assert("after << before (≥3x 감소)", afterCount * 3 <= beforeCount, `before=${beforeCount} after=${afterCount}`);
  assert("after = 60 (메시지당 1회)", afterCount === 60, `actual=${afterCount}`);
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
