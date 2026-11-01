/**
 * CI stability — Vitest worker↔main birpc hard-limits sync CPU to ~60s per RPC.
 * A single test that sync-blocks longer fails the ENTIRE run with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` even when all assertions pass.
 *
 * Scale parity (50k/100k) belongs in CUT7 bench scripts — not default vitest.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const ADVERSARIAL = path.join(
  root,
  "lib/stores/__tests__/store-discovery-shadow-adversarial-cut6.test.ts"
);

const CI_DENSE_POOL_MAX = 5_000;

function fail(msg) {
  console.error(`verify-vitest-worker-budget: FAIL — ${msg}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const adv = read("lib/stores/__tests__/store-discovery-shadow-adversarial-cut6.test.ts");

for (const m of adv.matchAll(/const\s+M\s*=\s*([\d_]+)/g)) {
  const n = Number(String(m[1]).replace(/_/g, ""));
  if (!Number.isFinite(n)) continue;
  if (n > CI_DENSE_POOL_MAX) {
    fail(
      `store-discovery-shadow-adversarial-cut6 dense pool M=${m[1]} exceeds CI-safe max ${CI_DENSE_POOL_MAX}. Use scripts/qa/stores-discovery-scale-cut7-* bench instead.`
    );
  }
}

/** Full N-store oracle loops in vitest — historical onTaskUpdate root cause. */
if (/\b50_000\b/.test(adv) && /new Array\(M\)|for \(let i = 0; i < M/.test(adv)) {
  fail("adversarial cut6 must not allocate/run full 50_000-store oracle in vitest");
}

/**
 * 2026-10-28 CI 3회 실패(bfaf78100·a214ecc12·20d66ce1c): dense pool 이 정렬 5종 + 홈 비교를 한 번에 동기 계산해
 * 로컬 전체 실행에서 15초 이벤트 루프를 막았고, 느린 러너에서 birpc 60초를 넘었다.
 * 무거운 단계 사이마다 이벤트 루프에 양보해야 한다(randomized parity 와 같은 방식).
 */
const densePool = adv.match(/describe\("CASE dense pool[\s\S]*?\n\}\);/);
if (!densePool) fail("CASE dense pool block not found");
const denseYields = (densePool[0].match(/await yieldToEventLoop\(\)/g) || []).length;
if (denseYields < 4) {
  fail(
    `CASE dense pool must yield to the event loop between heavy oracle steps (found ${denseYields}, need ≥4) — birpc onTaskUpdate 60s`
  );
}

/**
 * 2026-11-01: main CI 실패 표본 10건 중 7건이 시험 전부 통과 + onTaskUpdate 시간 초과였다. 즉시 끝나는 async 시험만
 * 이어지는 파일(trade-browse-location-tiers-contract CI 40초+)은 매크로태스크가 돌지 않아 RPC 응답을 못 받는다.
 * 전역 setup 이 시험마다 (가짜 타이머와 무관한) node:timers setImmediate 로 이벤트 루프를 놓아줘야 한다.
 */
const setup = read("tests/vitest-setup.node.ts");
const config = read("vitest.config.ts");
if (!/setupFiles:[^\n]*tests\/vitest-setup\.node\.ts/.test(config)) {
  fail("vitest.config.ts must load tests/vitest-setup.node.ts as setupFiles");
}
if (
  !/import\s*\{\s*setImmediate as realSetImmediate\s*\}\s*from\s*"node:timers"/.test(setup) ||
  !/afterEach\(\(\)\s*=>\s*new Promise<void>\(\(resolve\)\s*=>\s*realSetImmediate\(resolve\)\)\)/.test(setup)
) {
  fail("tests/vitest-setup.node.ts must yield one macrotask after every test (node:timers setImmediate) — birpc onTaskUpdate 60s");
}

console.log("verify-vitest-worker-budget: ok");
