// @vitest-environment jsdom
/**
 * 진입 감사 OS-2·OS-4 (2026-11-17) — 생명주기 이동(직전 화면 복원·안전 진입)이 예정된 문서의 시작 화면 해제 보류.
 * 실측: OS 종료 후 실행 → 홈 0.75초 → 라운지로 튐 / 안전 진입 `/` → `/home` 에서 흰 빈 화면 한 프레임.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decision = { navigateTo: null as string | null, kind: "os_restore" as string };
vi.mock("@/lib/lifecycle/app-entry-kind", () => ({
  getAppEntryDecision: () => ({ kind: decision.kind, reason: "test", navigateTo: decision.navigateTo }),
  appEntryAllowsIntro: () => false,
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("@/lib/launch-intro/startup-destination", () => ({
  getLaunchDestination: () => ({ destination: "community", reason: "test", snapshot: null }),
}));

async function loadHold(path: string, navigateTo: string | null, applied = false, kind = "os_restore") {
  vi.resetModules();
  decision.navigateTo = navigateTo;
  decision.kind = kind;
  window.history.replaceState(null, "", path);
  window.sessionStorage.clear();
  if (applied) window.sessionStorage.setItem("dibay:lifecycle:nav-applied", "1");
  return import("@/lib/startup/lifecycle-nav-hold");
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("lifecycle-nav-hold", () => {
  it("이동 예정(/ → /philife)이면 시작 주소에서는 해제하지 않고, 주소가 바뀐 뒤 해제한다", async () => {
    const h = await loadHold("/", "/philife");
    expect(h.lifecycleNavHoldStartPath()).toBe("/");
    expect(h.mayReleaseForLifecycleNav("/")).toBe(false);
    expect(h.mayReleaseForLifecycleNav("/philife")).toBe(true);
    // 리다이렉트로 다른 주소가 되어도 해제 (보류가 남지 않음)
    expect(h.mayReleaseForLifecycleNav("/login")).toBe(true);
  });

  it("`/` 와 `/home` 은 같은 홈 — 보류하지 않는다 (OS-2)", async () => {
    const h = await loadHold("/", "/home");
    expect(h.lifecycleNavHoldStartPath()).toBeNull();
    expect(h.mayReleaseForLifecycleNav("/")).toBe(true);
    expect(h.isSameLifecycleSurface("/", "/home")).toBe(true);
    expect(h.isSameLifecycleSurface("/home", "/philife")).toBe(false);
  });

  it("이동 없음 · 이미 적용 · 로그인 화면이면 보류하지 않는다", async () => {
    expect((await loadHold("/", null)).lifecycleNavHoldStartPath()).toBeNull();
    expect((await loadHold("/", "/philife", true)).lifecycleNavHoldStartPath()).toBeNull();
    expect((await loadHold("/login", "/philife")).lifecycleNavHoldStartPath()).toBeNull();
  });

  it("빌드 전 감사 W3: 새로 켬 첫 화면 이동(user_cold)은 「적용함」 표시와 상관없이 보류한다(표시는 복원·안전 진입 전용)", async () => {
    const h = await loadHold("/", "/philife", true, "user_cold");
    expect(h.lifecycleNavHoldStartPath()).toBe("/");
  });

  it("판단은 문서당 1회 — 나중에 적용 표시가 써져도 보류는 유지되고, settle 로만 풀린다", async () => {
    const h = await loadHold("/", "/philife");
    expect(h.lifecycleNavHoldStartPath()).toBe("/");
    window.sessionStorage.setItem("dibay:lifecycle:nav-applied", "1");
    expect(h.mayReleaseForLifecycleNav("/")).toBe(false);
    const run = vi.fn();
    h.onLifecycleNavHoldSettled(run);
    h.settleLifecycleNavHold();
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.mayReleaseForLifecycleNav("/")).toBe(true);
    const late = vi.fn();
    h.onLifecycleNavHoldSettled(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("해제 경로(첫 화면 신호 — P3 서버 본문 해제는 실기 FAIL-2 로 폐기)가 보류를 확인하고, 생명주기 효과가 모든 미이동 분기에서 보류를 푼다", () => {
    const metrics = readFileSync("lib/startup/startup-metrics.ts", "utf8");
    expect(metrics.match(/mayReleaseForLifecycleNav\(window\.location\.pathname\)/g)?.length).toBe(1);
    const effects = readFileSync("lib/lifecycle/lifecycle-route-effects.client.ts", "utf8");
    expect(effects.match(/settleLifecycleNavHold\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(effects).toContain("isSameLifecycleSurface(current, target)");
  });

  it("OS-1: 안드로이드 시작 화면 퇴장 리스너를 등록하지 않는다 (넘겨주기 2초 제한 대기 제거)", () => {
    const java = readFileSync("android/app/src/main/java/com/dibay/app/MainActivity.java", "utf8");
    expect(java).not.toMatch(/\.setOnExitAnimationListener\(/);
  });
});
