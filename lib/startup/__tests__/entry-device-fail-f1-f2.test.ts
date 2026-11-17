// @vitest-environment jsdom
/**
 * 실기 FAIL-1·FAIL-2 (Owner 「설계대로 진행 승인」 2026-11-17 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md)
 * F1: 인트로가 덮고 있는 동안 ◁ 의 주인은 인트로 하나 — 네이티브 등록 순서 + 웹 이중 방어.
 * F2: 앱 시작 화면은 hydration 전에 걷지 않는다(P3 폐기) — 해제 경로는 `tryDismissNativeSplash` 하나.
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
    const minimize = vi.fn();
    stack.__setOverlayBackListenerDriverForTests({
      install: (cb) => {
        onBack = cb;
        return () => {
          onBack = null;
        };
      },
      minimize,
    });
    const close = vi.fn();
    stack.pushOverlayBackEntry(close);
    const root = vi.fn();
    stack.setRootBackAction(root);
    return { press: () => onBack?.({ canGoBack: false }), close, root, minimize };
  }

  it("인트로 중 ◁ → 오버레이 닫기·첫 화면 처리·앱 내리기 모두 안 함(네이티브가 건너뛰기)", async () => {
    const t = await setup();
    t.press();
    expect(t.close).not.toHaveBeenCalled();
    expect(t.root).not.toHaveBeenCalled();
    expect(t.minimize).not.toHaveBeenCalled();
  });

  it("인트로가 끝난 실행(끝 표시)이면 지금 규칙 그대로 — 맨 위 오버레이부터", async () => {
    window.sessionStorage.setItem("dibay:native-intro:done", `:${INTRO_ID}`);
    const t = await setup();
    t.press();
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.minimize).not.toHaveBeenCalled();
  });
});

describe("F2 — 앱 시작 화면 해제는 hydration 뒤 단일 경로", () => {
  it("hydration 전 해제 진입점(instrumentation-client · P3 함수)이 없다", () => {
    expect(existsSync(join(root, "instrumentation-client.ts"))).toBe(false);
    const metrics = read("lib/startup/startup-metrics.ts");
    expect(metrics).not.toContain("releaseNativeSplashAtServerBodyFrame");
    expect(metrics).not.toContain('"serverBodyFirstFrame"');
  });

  it("네이티브 브리지 해제 호출은 tryDismissNativeSplash 한 곳뿐", () => {
    const metrics = read("lib/startup/startup-metrics.ts");
    const calls = metrics.match(/dismissNativeSplashBridges\(/g) ?? [];
    // 정의 1 + 호출 1
    expect(calls.length).toBe(2);
    const body = metrics.slice(metrics.indexOf("function tryDismissNativeSplash"), metrics.indexOf("function dismissNativeSplashBridges"));
    expect(body).toContain("dismissNativeSplashBridges(reason)");
  });
});
