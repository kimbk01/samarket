/**
 * 범위 밖 E1·E2 (2026-11-18 감사 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §24-14) — Android 빌드 77.
 * E1: 복원·최근 앱 실행의 옛 알림 의도를 다시 처리하지 않는다(통화 실행 제외).
 * E2: 통화 아닌 경로의 flush 재시도는 마지막 묶음 하나만 · 재시도 직전 대기 경로 일치 확인(통화 경로 불변).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync(
  path.resolve(__dirname, "../../../android/app/src/main/java/com/dibay/app/MainActivity.java"),
  "utf8"
);

function body(startMarker: string, endMarker: string): string {
  const a = main.indexOf(startMarker);
  const b = main.indexOf(endMarker, a + startMarker.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return main.slice(a, b);
}

describe("E1 복원 실행의 옛 알림 의도", () => {
  it("판정: 통화 실행은 언제나 처리 · 그 밖은 복원 또는 최근 앱 실행일 때만 건너뜀", () => {
    const fn = body("static boolean shouldSkipRestoredLaunchRoute(", "static boolean isSplashCoverLaunch(");
    expect(fn).toMatch(/if \(intent == null \|\| isCallLaunch\(intent\)\) return false;/);
    expect(fn).toContain("Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY");
    expect(fn).toContain("return restoredFromSavedState || fromHistory;");
  });

  it("onCreate 만 이 판정을 쓰고, 새 알림(onNewIntent)은 그대로 처리", () => {
    expect(main.match(/shouldSkipRestoredLaunchRoute\(launchIntent, savedInstanceState != null\)/g)?.length).toBe(1);
    expect(main).toMatch(/restored_launch_intent_skipped[\s\S]{0,300}\} else \{\s*handleNotificationLaunchIntent\(launchIntent\);\s*\}/);
  });

  it("보완(빌드 77 실기 FAIL): Capacitor load() 의 onNewIntent(getIntent()) 도 같은 판정 — super.onCreate 동안만", () => {
    expect(main).toMatch(
      /skipLaunchRouteDuringSuperOnCreate =\s*shouldSkipRestoredLaunchRoute\(getIntent\(\), savedInstanceState != null\);\s*try \{\s*super\.onCreate\(savedInstanceState\);\s*\} finally \{\s*skipLaunchRouteDuringSuperOnCreate = false;\s*\}/
    );
    const onNew = body("public void onNewIntent(Intent intent) {", "\n  }\n");
    expect(onNew).toMatch(/super\.onNewIntent\(intent\);\s*setIntent\(intent\);\s*if \(skipLaunchRouteDuringSuperOnCreate\) \{/);
    expect(onNew).toContain("handleNotificationLaunchIntent(intent);");
    expect(main.match(/skipLaunchRouteDuringSuperOnCreate = /g)?.length).toBe(2);
  });

  it("통화 V4 잠금 수락 표식 기록은 판정 앞에서 그대로", () => {
    const i = main.indexOf("main_activity_on_create_lock_hydration callId=");
    const j = main.indexOf("shouldSkipRestoredLaunchRoute(launchIntent");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});

describe("E2 경로 넣기 재시도", () => {
  const flush = body("private void flushPendingAppPathIfAny() {", "private static boolean isCalleeAcceptCallRoute(");

  it("통화 아닌 경로만 차례·대기 경로 확인 — 통화 경로는 조건 없이 이전과 같음", () => {
    expect(flush).toContain("final int flushGeneration = callPath ? 0 : ++nonCallPendingFlushGeneration;");
    expect(flush.match(/if \(!callPath && !isCurrentNonCallPendingFlush\(flushGeneration, appPath\)\) return;/g)?.length).toBe(2);
    expect(flush).toContain("ACCEPT_ROUTE_RETRY_DELAYS_MS");
    expect(flush).toContain("PENDING_ROUTE_RETRY_DELAYS_MS");
  });

  it("차례 증가는 메인 스레드 실행 안에서", () => {
    const post = flush.indexOf("mainHandler.post(");
    const inc = flush.indexOf("++nonCallPendingFlushGeneration");
    expect(post).toBeGreaterThan(-1);
    expect(inc).toBeGreaterThan(post);
  });

  it("통화 경로 판정 = navigateWebViewToAppPathNow 의 통화 판정과 같은 조건", () => {
    const fn = body("static boolean isCallPathForPendingFlush(", "private boolean isCurrentNonCallPendingFlush(");
    expect(fn).toContain('appPath.startsWith("/community-messenger/calls/") || CallV4Lane.isV4CallPath(appPath)');
    const nav = body("private boolean navigateWebViewToAppPathNow(", "private boolean loadCallRouteDirectly(");
    expect(nav).toMatch(/final boolean callRoute =\s*appPath\.startsWith\("\/community-messenger\/calls\/"\)\s*\|\| CallV4Lane\.isV4CallPath\(appPath\);/);
  });

  it("대기 경로 일치 확인", () => {
    const fn = body("private boolean isCurrentNonCallPendingFlush(", "\n  }\n");
    expect(fn).toContain("flushGeneration == nonCallPendingFlushGeneration && appPath.equals(pendingAppPath)");
  });
});
