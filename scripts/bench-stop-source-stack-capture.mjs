/**
 * `new Error("subscribeWithRetry.stop").stack` 동기 캡처 비용 측정.
 *
 * 사용:  node scripts/bench-stop-source-stack-capture.mjs
 *
 * 목표: prod hot cleanup 에서 매 channel stop 마다 발생하던 동기 비용을 정량화하고,
 * dev 게이트 뒤로 옮겼을 때의 절감 ms 를 사용자 환경에 가깝게 추정한다.
 *
 * 한계: V8 inspector 가 attach 되어 있을수록 실제 비용은 증가한다(브라우저 DevTools open 시).
 * Node 단독 실행은 inspector 없이 capture 만 측정 — DevTools open 환경의 하한선.
 */

function pretendStopBefore() {
  let stack = null;
  try {
    stack = new Error("subscribeWithRetry.stop").stack ?? null;
  } catch {
    stack = null;
  }
  return stack;
}

function pretendStopAfter() {
  // dev gate 안에 들어가서 prod 에선 아래 분기 미진입
  // 모방: const _gate = false; if (_gate) { ... } — 실측 비용이 어셈블리 레벨에서 사라짐
  const _gate = false;
  if (_gate) {
    let stack = null;
    try {
      stack = new Error("subscribeWithRetry.stop").stack ?? null;
    } catch {
      stack = null;
    }
    return stack;
  }
  return null;
}

const ITER = 10_000;

function bench(name, fn) {
  // 워밍업
  for (let i = 0; i < 200; i += 1) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < ITER; i += 1) fn();
  const end = process.hrtime.bigint();
  const totalUs = Number(end - start) / 1_000;
  const perCallUs = totalUs / ITER;
  console.log(`  ${name}: total=${totalUs.toFixed(0)}µs / ${ITER} = ${perCallUs.toFixed(2)}µs/call`);
  return perCallUs;
}

console.log(`stack 캡처 비용 (n=${ITER}, Node ${process.version}, inspector OFF):`);
const usBefore = bench("BEFORE (951a9d6 → 43a31735)", pretendStopBefore);
const usAfter = bench("AFTER  (dev gate 적용)        ", pretendStopAfter);

const ratio = usBefore / Math.max(0.0001, usAfter);
console.log(`\n  per-call delta: ${(usBefore - usAfter).toFixed(2)}µs (감소 ratio ≈ ${ratio.toFixed(0)}x)`);

/**
 * 방 전환 1회 시 channel stop 횟수의 합리적 범위는 1–3회 (bundle 청크 1–2 + home rooms-in 0–1).
 * 본 마이크로벤치 결과로 prod 에서의 추정 절감을 구한다.
 *
 * 주의: 브라우저 DevTools open 시 stack 캡처 + inspector 직렬화가 추가되어 실제 비용은
 * 본 Node 측정의 1.5–5배까지 늘어난다(Chromium 일반치). 따라서 아래 추정은 하한선.
 */
const stopsPerTransition = [1, 2, 3];
console.log(`\n방 전환 1회당 추정 절감 (Node 하한선):`);
for (const n of stopsPerTransition) {
  const savedUs = (usBefore - usAfter) * n;
  console.log(`  ${n} stop/transition → 절감 ≈ ${savedUs.toFixed(1)}µs (= ${(savedUs / 1000).toFixed(2)}ms)`);
}
console.log(`브라우저(DevTools open) 환경에서는 위 수치의 1.5–5배 곱한 값이 실제 절감.`);
