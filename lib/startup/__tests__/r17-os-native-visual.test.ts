/**
 * R17-OS — native start visual contract (static guards only; runtime PASS = device frames).
 *
 * ANDROID: TRUE OS SplashScreen (#075740 + centered logo) → existing visual fence → Community
 * IOS:     TRUE LaunchScreen → app-native SAME storyboard continuation → Community
 * WEB:     Community (no splash)
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("R17-OS Android TRUE OS splash resources", () => {
  it("launch theme uses the OS background and centered logo only", () => {
    const styles = src("android/app/src/main/res/values/styles.xml");
    const launch = styles.slice(
      styles.indexOf('<style name="AppTheme.NoActionBarLaunch"'),
      styles.indexOf("</style>", styles.indexOf('<style name="AppTheme.NoActionBarLaunch"'))
    );
    for (const attr of [
      "windowSplashScreenBackground",
      "android:windowSplashScreenBackground",
      "windowSplashScreenIconBackgroundColor",
      "android:windowSplashScreenIconBackgroundColor",
    ]) {
      expect(launch).toContain(`<item name="${attr}">@color/dibay_os_bg</item>`);
    }
    expect(launch).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/ic_os_logo</item>');
    expect(launch).toContain(
      '<item name="android:windowSplashScreenAnimatedIcon">@drawable/ic_os_logo</item>'
    );
    expect(src("android/app/src/main/res/values/colors.xml")).toContain(
      '<color name="dibay_os_bg">#075740</color>'
    );
    expect(existsSync(resolve(process.cwd(), "android/app/src/main/res/drawable-nodpi/ic_os_logo.png"))).toBe(
      true
    );
  });

  /**
   * 2026-11-08 Owner D1 개정 (docs/dibay-app-entry-resume-hard-lock.md H1 · app-entry-resume-stabilization-plan §4 C1):
   * 해제 권한 = ① 웹 성공 신호(정상, visual-state fence 유지) ② 네이티브 고장 판정. 표시 타이머(최소·최대 표시, 구 8초)는 계속 금지.
   * 이전 계약(「웹 신호만·타이머 0」)은 웹이 멈추면 녹색 로고가 영원히 남는 결함을 고정하고 있었다.
   */
  it("Android: web signal + visual-state fence stay the normal release; fault judgment is the only other release", () => {
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("setKeepOnScreenCondition(() -> !webSplashDismissRequested)");
    expect(main).toContain("postVisualStateCallback");
    // 표시 타이머 금지 유지
    expect(main).not.toMatch(/SPLASH_MAX_KEEP_MS|minimumVisibleMs/);
    // 고장 판정 = 문서 완료 후에만 시작, 정책 클래스가 판정
    expect(main).toContain("startStartupFaultProbe(url);");
    expect(main).toContain("DibayStartupFaultPolicy.judge(");
    // 오류 화면은 화면 커밋을 기다리지 않고 즉시 해제 (pending 잠금 해소)
    const overlay = main.slice(main.indexOf("private void showWebViewLoadErrorOverlay"));
    expect(overlay.slice(0, overlay.indexOf("\n  }\n"))).toContain('forceReleaseSplash("webview_load_error");');
    const policy = src("android/app/src/main/java/com/dibay/app/DibayStartupFaultPolicy.java");
    expect(policy).toContain("T_JS_MS = 8_000L");
    expect(policy).toContain("T_RELEASE_MS = 15_000L");
    expect(policy).toContain("MAX_AUTO_RELOADS = 1");
  });
});

describe("R17-OS iOS LaunchScreen + same-visual continuation", () => {
  it("LaunchScreen carries the OS background and a content-addressed launch logo image", () => {
    const sb = src("ios/App/App/Base.lproj/LaunchScreen.storyboard");
    expect(sb).toContain('red="0.027450980392156862" green="0.3411764705882353" blue="0.25098039215686274"');
    // iOS caches launch images by NAME: a logo change must change the name, or the system
    // LaunchScreen keeps drawing the old logo while the continuation draws the new one.
    const cfg = JSON.parse(src("config/os-launch.json"));
    const key = createHash("sha256").update(`${cfg.logo.sha256}:${cfg.ios.logoWidthPt}`).digest("hex").slice(0, 10);
    const name = `OsLaunchLogo-${key}`;
    expect(sb).toContain(`image="${name}"`);
    expect(sb).toContain(`<image name="${name}"`);
    expect(sb).not.toContain('image="OsLaunchLogo"');
    const assets = resolve(process.cwd(), "ios/App/App/Assets.xcassets");
    expect(existsSync(resolve(assets, `${name}.imageset/Contents.json`))).toBe(true);
    expect(readdirSync(assets).filter((n) => n.startsWith("OsLaunchLogo"))).toEqual([`${name}.imageset`]);
  });

  it("continuation instantiates the SAME launch storyboard and has no product semantics", () => {
    const vc = src("ios/App/App/DibayRootBridgeViewController.swift");
    expect(vc).toContain('forInfoDictionaryKey: "UILaunchStoryboardName"');
    expect(vc).toContain(".instantiateInitialViewController()");
    expect(vc).toContain('action == "dismissSplash"');
    expect(vc).toContain("\\.isLoading");
    // Normal success release = dismissSplash only; load end releases only when the app never started.
    expect(vc).toContain("typeof window.next === 'object' && window.next !== null");
    // C7 (2026-11-08): 앱이 시작되지 않은 채 로드가 멈추면 빈 화면 대신 오류 안내 + 「다시 시도」.
    expect(vc).toContain('showStartupErrorView(kind: .network, reason: "main_load_stopped_without_app")');
    expect(vc).not.toContain('removeLaunchContinuation(reason: "main_load_stopped")');
    for (const forbidden of [
      "asyncAfter",
      "Timer",
      "UIView.animate",
      "UIView.transition",
      "URLSession",
      "minimumVisible",
      "Intro",
      "generation",
    ]) {
      const continuationCode = vc.slice(
        vc.indexOf("private func installLaunchContinuationIfNeeded"),
        vc.indexOf("private func installBootBridgeIfNeeded")
      );
      expect(continuationCode.length, "continuation code present").toBeGreaterThan(200);
      expect(continuationCode, forbidden).not.toContain(forbidden);
    }
  });

  it("iOS fault judgment (C7) lives outside the continuation and mirrors the Android policy", () => {
    const vc = src("ios/App/App/DibayRootBridgeViewController.swift");
    expect(vc).toContain("static let startupFaultJsTimeoutMs = 8_000");
    expect(vc).toContain("static let startupFaultReleaseTimeoutMs = 15_000");
    expect(vc).toContain("startupFaultAutoReloads < 1");
    expect(vc).toContain("guard UIApplication.shared.applicationState == .active else {");
    expect(vc).toContain("final class DibayNavigationDelegateProxy: NSObject, WKNavigationDelegate");
    expect(vc).toContain("installLaunchContinuationIfNeeded()\n    NSLog(\"[DibayRootBridge] webcontent_terminated_continuation_reinstalled\")");
    expect(vc).not.toMatch(/minimumVisible|startupDisplayTimer/);
    // 검토 D4·D5 (2026-11-08): 통화 경로는 고장 판정·재덮기 제외, 비활성일 때 타이머 정지
    expect(vc).toContain("static func startupFaultIsCallRoute(_ url: URL?) -> Bool");
    expect(vc).toContain('NSLog("[DibayRootBridge] startup_fault_probe_skipped reason=call_route")');
    expect(vc).toContain("presentedViewController != nil");
    expect(vc).toContain("pauseStartupFaultProbe(docURL: docURL)");
  });

  it("iOS T_doc (Owner 2026-11-08): first-document wait cap = Android load timeout, call routes skipped, late document recovers", () => {
    const vc = src("ios/App/App/DibayRootBridgeViewController.swift");
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const iosMs = Number(/static let startupDocWaitTimeoutMs = ([\d_]+)/.exec(vc)?.[1]?.replace(/_/g, ""));
    const androidMs = Number(/WEBVIEW_LOAD_TIMEOUT_MS = ([\d_]+)L/.exec(main)?.[1]?.replace(/_/g, ""));
    expect(iosMs).toBe(10_000);
    expect(iosMs).toBe(androidMs);
    // 문서 시작에서 관찰 시작, 문서 완료·실패·WebContent 종료에서 정지
    expect(vc).toMatch(/func startupFaultDocumentStarted\(\) \{\n    stopStartupFaultProbe\(\)\n    startStartupDocWait\(\)/);
    expect(vc).toMatch(/func startupFaultDocumentFinished\(\) \{\n    stopStartupFaultProbe\(\)\n    stopStartupDocWait\(\)/);
    expect(vc).toMatch(/func startupFaultContentProcessTerminated\(\) \{\n    stopStartupFaultProbe\(\)\n    stopStartupDocWait\(\)/);
    // 시작 화면이 있을 때만 · 통화 경로/네이티브 통화 화면 제외(시작·발동 두 번 확인) · 앱 활성 시간만
    const docWait = vc.slice(vc.indexOf("private func startStartupDocWait"), vc.indexOf("/// D5: 비활성이면"));
    expect(docWait).toContain("guard launchContinuation != nil else { return }");
    expect(docWait.match(/startupFaultIsCallRoute\(webView\?\.url\)/g)?.length).toBe(2);
    expect(docWait).toContain("guard UIApplication.shared.applicationState == .active else {");
    // 로드를 끊지 않는다 — stopLoading·reload 금지, 오류 화면만
    expect(docWait).not.toMatch(/stopLoading|\.reload\(\)/);
    expect(docWait).toContain('showStartupErrorView(kind: .network, reason: "DOC_WAIT_TIMEOUT")');
    // 문서가 늦게 도착하면 오류 화면을 걷고 시작 화면으로 되돌린다
    expect(vc).toContain("if startupErrorViewFromDocWait {\n      // T_doc");
    expect(vc).toContain('NSLog("[DibayRootBridge] startup_doc_wait_recovered")');
  });

  it("Android: no time-based release on the healthy path (D3) · call routes skip the fault probe (D4) · paused while hidden (D5)", () => {
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).not.toContain("visual_state_fallback");
    expect(main).not.toContain("VISUAL_STATE_FALLBACK_MS");
    expect(main).toContain('Log.i(WEBVIEW_LOG_TAG, "startup_fault_probe_skipped reason=call_route");');
    expect(main).toContain("startupFaultPausedRunnable = this;");
    expect(main).toContain("mainHandler.postDelayed(pausedProbe, STARTUP_FAULT_PROBE_TICK_MS);");
  });

  it("Capacitor SplashScreen plugin stays a no-op (no second native owner)", () => {
    const cfg = src("capacitor.config.ts");
    expect(cfg).toContain("launchShowDuration: 0");
    expect(cfg).toContain("launchAutoHide: true");
  });
});

describe("R17-OS web → iOS dismiss signal", () => {
  it("posts dismissSplash to the webkit handler after the next frame, without timers", () => {
    const metrics = src("lib/startup/startup-metrics.ts");
    const body = metrics.slice(metrics.indexOf("export function tryDismissNativeSplash"));
    expect(body).toContain('postMessage({ action: "dismissSplash" })');
    expect(body).toContain("requestAnimationFrame(() => requestAnimationFrame(postDismiss))");
    const fn = body.slice(0, body.indexOf("\nfunction "));
    expect(fn).not.toContain("setTimeout");
  });
});
