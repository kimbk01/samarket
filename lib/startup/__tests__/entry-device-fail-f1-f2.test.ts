// @vitest-environment jsdom
/**
 * 실기 FAIL-1·FAIL-2 (Owner 「설계대로 진행 승인」 2026-11-17 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md)
 * F1: 인트로가 덮고 있는 동안 ◁ 의 주인은 인트로 하나 — 네이티브 등록 순서 + 웹 이중 방어.
 * F2(P3 폐기)는 빌드 68 실측 FAIL(흰 화면 그대로 · 홈만 늦어짐) → F2′(§6): Android 앱 안 덮개가 있는 실행만 P3 를 건너뛰고,
 * 덮개 없는 설치 앱은 P3 그대로. 동작 시험은 server-body-splash-release.test.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("F1-a 네이티브 — 인트로 ◁ 콜백이 Capacitor AppPlugin 보다 먼저 받는다", () => {
  it("인트로 콜백은 소유자(Activity) 등록 — AppPlugin 과 같은 화면 시작(onStart) 등록 줄에 선다", () => {
    const src = read("android/app/src/main/java/com/dibay/app/DibayNativeIntro.java");
    expect(src).toContain("getOnBackPressedDispatcher().addCallback(owner, backCallback)");
    expect(src).not.toMatch(/getOnBackPressedDispatcher\(\)\.addCallback\(backCallback\)/);
  });

  it("MainActivity: 인트로 부착은 super.onCreate(AppPlugin 등록) 뒤 — 나중 등록 = 먼저 받음", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const superAt = main.indexOf("super.onCreate(savedInstanceState);");
    const attachAt = main.indexOf("DibayNativeIntro.attach(this);");
    expect(superAt).toBeGreaterThan(0);
    expect(attachAt).toBeGreaterThan(superAt);
  });
});

describe("F1-b 웹 — 네이티브 인트로가 덮고 있으면 웹 ◁ 처리는 아무것도 하지 않는다", () => {
  const INTRO_ID = "0a7e57a0-0000-4000-8000-000000000a01";
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
    Object.defineProperty(window, "__DIBAY_NATIVE_INTRO__", { value: INTRO_ID, configurable: true, writable: true });
  });
  afterEach(() => {
    delete (window as unknown as { __DIBAY_NATIVE_INTRO__?: string }).__DIBAY_NATIVE_INTRO__;
  });

  async function setup() {
    const stack = await import("@/lib/ui/overlay-back-stack");
    let onBack: ((ev: { canGoBack?: boolean }) => void) | null = null;
    stack.__setOverlayBackListenerDriverForTests({
      install: (cb) => {
        onBack = cb;
        return () => {
          onBack = null;
        };
      },
    });
    const close = vi.fn();
    stack.pushOverlayBackEntry(close);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    return { press: () => onBack?.({ canGoBack: true }), close, back };
  }

  it("인트로 중 ◁ → 오버레이 닫기·기록 뒤로 모두 안 함(네이티브가 건너뛰기)", async () => {
    const t = await setup();
    t.press();
    expect(t.close).not.toHaveBeenCalled();
    expect(t.back).not.toHaveBeenCalled();
  });

  it("인트로가 끝난 실행(끝 표시)이면 지금 규칙 그대로 — 맨 위 오버레이부터", async () => {
    window.sessionStorage.setItem("dibay:native-intro:done", `:${INTRO_ID}`);
    const t = await setup();
    t.press();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
});

describe("F2′ — P3 는 앱 안 덮개가 없는 실행에서만", () => {
  it("hydration 전 해제 진입점(instrumentation-client → P3 함수)이 있다", () => {
    expect(existsSync(join(root, "instrumentation-client.ts"))).toBe(true);
    expect(read("instrumentation-client.ts")).toContain("releaseNativeSplashAtServerBodyFrame()");
  });

  it("P3 함수는 덮개 확인을 맨 앞에서 한다", () => {
    const metrics = read("lib/startup/startup-metrics.ts");
    const body = metrics.slice(metrics.indexOf("export function releaseNativeSplashAtServerBodyFrame"));
    const firstGuard = body.indexOf("if (isNativeSplashCoverActive()) return;");
    expect(firstGuard).toBeGreaterThan(0);
    expect(firstGuard).toBeLessThan(body.indexOf("requestAnimationFrame(tick)"));
  });

  it("Android: 덮개 표시 값은 문서 시작 스크립트로 넣고, 덮개는 웹 해제·고장 해제 때 걷는다", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("__DIBAY_NATIVE_SPLASH_COVER__");
    expect(main).toContain("DibaySplashCover.documentStartValue()");
    expect(main).toContain("DibaySplashCover.isShowing()");
    expect((main.match(/DibaySplashCover\.hide\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
