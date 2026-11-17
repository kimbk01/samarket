// @vitest-environment jsdom
/**
 * 실기 FAIL-1·FAIL-2 (Owner 「설계대로 진행 승인」 2026-11-17 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md)
 * F1: 인트로가 덮고 있는 동안 ◁ 의 주인은 인트로 하나 — 네이티브 등록 순서 + 웹 이중 방어.
 * F2(P3 폐기)는 빌드 68 실측 FAIL → F2′(§6) Android 앱 안 덮개(빌드 69) → G1(§8·§9): 덮개 실행도 P3 신호로 걷는다
 * (덮개 아래에서 WebView 는 그리지 않고, 덮개를 걷는 프레임에 첫 내용 그리기가 함께 일어난다). 동작 시험은 server-body-splash-release.test.ts.
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

describe("방식 A — 덮개 실행은 hydration 뒤 해제 · 네이티브는 커밋 확인 뒤 덮개를 걷는다 (§14-2)", () => {
  it("hydration 전 해제 진입점(instrumentation-client → P3 함수)은 덮개 없는 실행용으로 남는다", () => {
    expect(existsSync(join(root, "instrumentation-client.ts"))).toBe(true);
    expect(read("instrumentation-client.ts")).toContain("releaseNativeSplashAtServerBodyFrame()");
  });

  it("P3 함수는 덮개 실행이면 하지 않는다 · 설계 H(인라인 표시·즉시 해제)는 없다", () => {
    const metrics = read("lib/startup/startup-metrics.ts");
    const body = metrics.slice(metrics.indexOf("export function releaseNativeSplashAtServerBodyFrame"));
    const guard = body.indexOf("if (isNativeSplashCoverActive()) return;");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf("requestAnimationFrame(tick)"));
    expect(metrics).not.toContain("dismissSplashPainted");
    expect(existsSync(join(root, "lib/startup/server-body-frame-mark.ts"))).toBe(false);
    expect(read("components/home-hub/HomeSurface.tsx")).not.toContain("SERVER_BODY_FRAME_MARK");
  });

  it("Android: 덮개 값 문서 시작 스크립트 · 모든 웹 해제는 화면 커밋 콜백 경로(dismissSplashPainted 도 같은 경로)", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("__DIBAY_NATIVE_SPLASH_COVER__");
    expect(main).toContain("DibaySplashCover.documentStartValue()");
    expect(main).toContain("DibaySplashCover.isShowing()");
    expect(main).not.toContain("requestWebSplashDismissPainted");
    const painted = main.slice(main.indexOf("public void dismissSplashPainted()"));
    expect(painted.slice(0, painted.indexOf("\n    }\n"))).toContain('requestWebSplashDismiss("DibayBootBridge.painted")');
    expect((main.match(/DibaySplashCover\.hide\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("설계 R2-1 — 덮개 = 아이콘 실행 + 통화 아닌 알림 탭·딥링크 (§19-2)", () => {
  const main = () => read("android/app/src/main/java/com/dibay/app/MainActivity.java");
  const fnBody = (src: string, sig: string) => {
    const s = src.slice(src.indexOf(sig));
    return s.slice(0, s.indexOf("\n  }\n"));
  };

  it("덮개 계획은 isSplashCoverLaunch 로 정한다(인트로는 지금처럼 아이콘 실행만)", () => {
    const src = main();
    expect(src).toContain("DibaySplashCover.planForLaunch(\n        isSplashCoverLaunch(getIntent()),");
    expect(src).toContain("if (!DibayNativeIntro.processSelectionDone() && isLauncherLaunch(getIntent())) {");
  });

  it("통화 실행 판별 — dibay://call·call-v4 · V4 잠금 수락 · 통화 FCM 키 · 종류에 call", () => {
    const body = fnBody(main(), "static boolean isCallLaunch(Intent intent)");
    expect(body).toContain('"call".equals(host) || "call-v4".equals(host)');
    expect(body).toContain("CallV4IntentHelper.EXTRA_V4_LOCK_BACKGROUND_HYDRATION");
    for (const k of ["call_push_kind", "dibay_call", "call_id", "callId"]) expect(body).toContain(`"${k}"`);
    expect(body).toContain('.contains("call")');
  });

  it("덮개 실행 — 통화면 먼저 제외 · VIEW(로그인 되돌아오기 제외) · 경로 없는 알림 MAIN+notificationId", () => {
    const body = fnBody(main(), "static boolean isSplashCoverLaunch(Intent intent)");
    expect(body.indexOf("isCallLaunch(intent)")).toBeGreaterThan(0);
    expect(body.indexOf("isCallLaunch(intent)")).toBeLessThan(body.indexOf("Intent.ACTION_VIEW.equals(action)"));
    expect(body).toContain('"auth".equals(data.getHost())');
    expect(body).toContain('ex.containsKey("notificationId")');
  });
});
