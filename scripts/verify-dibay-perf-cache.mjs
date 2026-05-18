#!/usr/bin/env node
/**
 * DIBAY perf cache 검증 — dev 서버 + 브라우저 Cookie 필요.
 *
 * 사용:
 *   $env:SAMARKET_VERIFY_COOKIE='sb-...=...; ...'  # Application > Cookies 복사
 *   node scripts/verify-dibay-perf-cache.mjs
 *
 * 또는:
 *   SAMARKET_VERIFY_ORIGIN=http://localhost:3000 node scripts/verify-dibay-perf-cache.mjs
 */
const origin = (process.env.SAMARKET_VERIFY_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
const cookie = (process.env.SAMARKET_VERIFY_COOKIE ?? "").trim();

if (!cookie) {
  console.error(
    "[verify-dibay-perf-cache] SAMARKET_VERIFY_COOKIE 가 비어 있습니다.\n" +
      "  Chrome DevTools > Application > Cookies > localhost 에서 sb-* 및 active_session 등을 복사해 주세요."
  );
  process.exit(2);
}

const headers = { cookie, accept: "application/json" };

async function timedFetch(label, url) {
  const t0 = performance.now();
  const res = await fetch(url, { headers, cache: "no-store" });
  const wallMs = Math.round(performance.now() - t0);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { label, url, status: res.status, wallMs, ok: res.ok, body };
}

async function runHomeSyncRuns() {
  const url = `${origin}/api/community-messenger/home-sync?tier=critical`;
  const runs = [];
  for (let i = 1; i <= 3; i++) {
    runs.push(await timedFetch(`home-sync#${i}`, url));
    await new Promise((r) => setTimeout(r, 120));
  }
  return runs;
}

async function main() {
  console.log("[verify-dibay-perf-cache] origin=", origin);

  const session = await timedFetch("auth/session", `${origin}/api/auth/session`);
  const badgeWarm = await timedFetch("badge#1", `${origin}/api/me/store-owner-hub-badge`);
  const badgeWarm2 = await timedFetch("badge#2", `${origin}/api/me/store-owner-hub-badge`);
  const badgeFresh = await timedFetch(
    "badge-cmFresh",
    `${origin}/api/me/store-owner-hub-badge?cmFresh=1`
  );
  const homeRuns = await runHomeSyncRuns();

  const table = [session, ...homeRuns, badgeWarm, badgeWarm2, badgeFresh];
  console.log("\n| run | status | wall_ms | note |");
  console.log("|-----|--------|---------|------|");
  for (const row of table) {
    const note =
      row.status === 401
        ? "auth required"
        : row.label.startsWith("home-sync")
          ? "check server [home-sync-perf]"
          : row.label.startsWith("badge")
            ? "check server [route-perf]"
            : "check server [route-perf]";
    console.log(`| ${row.label} | ${row.status} | ${row.wallMs} | ${note} |`);
  }

  const homeOk = homeRuns.filter((r) => r.ok);
  if (homeOk.length >= 2 && homeOk[1].wallMs <= 200 && homeOk[2].wallMs <= 200) {
    console.log("\n[verify-dibay-perf-cache] PASS — home-sync 2·3회 wall ≤200ms (서버 로그에서 short_ttl_hit 확인)");
  } else if (homeOk.length === 0) {
    console.log("\n[verify-dibay-perf-cache] FAIL — home-sync 모두 비인증 또는 오류");
    process.exit(1);
  } else {
    console.log(
      "\n[verify-dibay-perf-cache] WARN — 2·3회 wall이 200ms 초과일 수 있음. 터미널 [home-sync-perf] 의 short_ttl_hit·route_bundle_await_ms 확인"
    );
  }

  if (badgeWarm.ok && badgeWarm2.ok && badgeWarm2.wallMs <= 80) {
    console.log("[verify-dibay-perf-cache] PASS — badge warm repeat wall ≤80ms");
  }
  if (session.ok && session.wallMs <= 80) {
    console.log("[verify-dibay-perf-cache] PASS — auth/session wall ≤80ms (repeat for ttl)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
