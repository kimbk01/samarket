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

  it("Android dismiss logic is unchanged: web signal + visual-state fence, no timer", () => {
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("setKeepOnScreenCondition(() -> !webSplashDismissRequested)");
    expect(main).toContain("postVisualStateCallback");
    expect(main).not.toMatch(/SPLASH_MAX_KEEP_MS|minimumVisibleMs/);
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
    expect(vc).toContain('removeLaunchContinuation(reason: "main_load_stopped_without_app")');
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
