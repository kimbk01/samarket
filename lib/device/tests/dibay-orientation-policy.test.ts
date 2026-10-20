import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  nativeRouteModeValue,
  orientationPolicyForDeviceClass,
  orientationPolicyForRoute,
  shouldLockIosAppPortrait,
  shouldRequestAdminLandscapeLock,
  shouldRequestAndroidAppPortrait,
} from "@/lib/device/dibay-orientation-policy";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("FD3 orientation policy contract", () => {
  it("PHONE_ANDROID → PORTRAIT_ONLY", () => {
    expect(orientationPolicyForDeviceClass("PHONE_ANDROID")).toBe("PORTRAIT_ONLY");
    expect(shouldRequestAndroidAppPortrait("PHONE_ANDROID")).toBe(true);
  });

  it("TABLET_ANDROID → UNLOCKED", () => {
    expect(orientationPolicyForDeviceClass("TABLET_ANDROID")).toBe("PORTRAIT_AND_LANDSCAPE");
    expect(shouldRequestAndroidAppPortrait("TABLET_ANDROID")).toBe(false);
  });

  it("PHONE_IOS → PORTRAIT_ONLY", () => {
    expect(orientationPolicyForDeviceClass("PHONE_IOS")).toBe("PORTRAIT_ONLY");
    expect(shouldLockIosAppPortrait("PHONE_IOS")).toBe(true);
  });

  it("TABLET_IPAD → PORTRAIT_AND_LANDSCAPE", () => {
    expect(orientationPolicyForDeviceClass("TABLET_IPAD")).toBe("PORTRAIT_AND_LANDSCAPE");
    expect(shouldLockIosAppPortrait("TABLET_IPAD")).toBe(false);
  });

  it("DESKTOP_WINDOWS → RESIZABLE_DESKTOP", () => {
    expect(orientationPolicyForDeviceClass("DESKTOP_WINDOWS")).toBe("RESIZABLE_DESKTOP");
  });

  it("UNKNOWN → no forced phone orientation", () => {
    expect(orientationPolicyForDeviceClass("UNKNOWN")).toBe("UNKNOWN_SAFE");
    expect(shouldRequestAndroidAppPortrait("UNKNOWN")).toBe(false);
    expect(shouldLockIosAppPortrait("UNKNOWN")).toBe(false);
  });
});

describe("FD3 native authority sharing", () => {
  it("Android plugin and MainActivity consume the shared classifier", () => {
    const plugin = src("android/app/src/main/java/com/dibay/app/DibayDeviceClassPlugin.java");
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const classifier = src("android/app/src/main/java/com/dibay/app/DibayDeviceClassClassifier.java");
    const policy = src("android/app/src/main/java/com/dibay/app/DibayAppOrientationPolicy.java");
    expect(classifier).toContain("TABLET_SMALLEST_WIDTH_DP = 600");
    expect(plugin).toContain("DibayDeviceClassClassifier.classify");
    expect(plugin).not.toMatch(/smallestScreenWidthDp\s*>=\s*600/);
    expect(main).toContain("DibayAppOrientationPolicy.applyToAppShell(this)");
    expect(main).not.toContain("TABLET_SMALLEST_WIDTH_DP");
    expect(main).not.toContain("SCREEN_ORIENTATION_PORTRAIT");
    expect(policy).toContain("PHONE_ANDROID");
    expect(policy).toContain("setRequestedOrientation");
    expect(policy).not.toContain("onResume");
  });

  it("does not put a global MainActivity portrait in the manifest", () => {
    const manifest = src("android/app/src/main/AndroidManifest.xml");
    const mainBlock = manifest.split('android:name=".MainActivity"')[1]?.split("<activity")[0] ?? "";
    expect(mainBlock).not.toContain("android:screenOrientation");
  });

  it("keeps Call video portrait as Call presentation, not FD3", () => {
    const video = src("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java");
    expect(video).toContain("setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)");
    const voice = src("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java");
    const incoming = src("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(voice).not.toContain("setRequestedOrientation");
    expect(incoming).not.toContain("setRequestedOrientation");
  });

  it("iPhone plist is portrait-only and iPad keeps tablet orientations", () => {
    const plist = src("ios/App/App/Info.plist");
    const phone = plist.split("UISupportedInterfaceOrientations")[1]?.split("~ipad")[0] ?? "";
    const ipad = plist.split("UISupportedInterfaceOrientations~ipad")[1] ?? "";
    expect(phone).toContain("UIInterfaceOrientationPortrait");
    expect(phone).not.toContain("LandscapeLeft");
    expect(phone).not.toContain("LandscapeRight");
    expect(ipad).toContain("UIInterfaceOrientationPortrait");
    expect(ipad).toContain("UIInterfaceOrientationPortraitUpsideDown");
    expect(ipad).toContain("UIInterfaceOrientationLandscapeLeft");
    expect(ipad).toContain("UIInterfaceOrientationLandscapeRight");
  });

  it("iOS root VC and plugin consume the shared classifier", () => {
    const vc = src("ios/App/App/DibayRootBridgeViewController.swift");
    const plugin = src("ios/App/App/Plugins/DibayDeviceClassPlugin.swift");
    const classifier = src("ios/App/App/Plugins/DibayDeviceClassClassifier.swift");
    expect(classifier).toContain(".phone");
    expect(classifier).toContain("PHONE_IOS");
    expect(plugin).toContain("DibayDeviceClassClassifier.classify()");
    expect(vc).toContain("DibayAppOrientationPolicy.supportedInterfaceOrientations");
    expect(vc).toContain("DibayDeviceClassClassifier.classify()");
    // REBUILD 14 ZERO: root VC must not own product Intro/System Start presentation.
    expect(vc).not.toContain("DibayIntroRuntime");
    expect(vc).not.toContain("DibaySystemStartSurface");
    expect(vc).not.toContain("presentationReleased");
  });

  it("PWA manifest is not a phone portrait SSOT", () => {
    const manifest = src("app/manifest.ts");
    expect(manifest).toContain('orientation: "any"');
    expect(manifest).not.toContain("portrait-primary");
  });

  it("does not add JS delayed rotation or CSS orientation hacks", () => {
    const policy = src("lib/device/dibay-orientation-policy.ts");
    expect(policy).not.toContain("setTimeout");
    expect(policy).not.toContain("screen.orientation.lock");
    const css = src("app/owner-compact-shell.css");
    expect(css).toContain("@media (max-width: 1024px) and (min-width: 568px) and (orientation: landscape)");
  });
});

describe("Admin v4 §2-2 B·C — ADMIN_LANDSCAPE route mode (deliberate contract change)", () => {
  it("phones stay portrait-only even on admin routes", () => {
    expect(shouldRequestAdminLandscapeLock("PHONE_ANDROID")).toBe(false);
    expect(shouldRequestAdminLandscapeLock("PHONE_IOS")).toBe(false);
    expect(orientationPolicyForRoute("PHONE_ANDROID", "ADMIN_LANDSCAPE")).toBe("PORTRAIT_ONLY");
    expect(orientationPolicyForRoute("PHONE_IOS", "ADMIN_LANDSCAPE")).toBe("PORTRAIT_ONLY");
  });

  it("tablets: landscape only on admin route, unlocked on member routes", () => {
    expect(orientationPolicyForRoute("TABLET_ANDROID", "ADMIN_LANDSCAPE")).toBe("LANDSCAPE_ONLY");
    expect(orientationPolicyForRoute("TABLET_IPAD", "ADMIN_LANDSCAPE")).toBe("LANDSCAPE_ONLY");
    expect(orientationPolicyForRoute("TABLET_ANDROID", "DEFAULT")).toBe("PORTRAIT_AND_LANDSCAPE");
    expect(orientationPolicyForRoute("TABLET_IPAD", "DEFAULT")).toBe("PORTRAIT_AND_LANDSCAPE");
  });

  it("UNKNOWN / desktop never get a native lock", () => {
    expect(orientationPolicyForRoute("UNKNOWN", "ADMIN_LANDSCAPE")).toBe("UNKNOWN_SAFE");
    expect(shouldRequestAdminLandscapeLock("DESKTOP_WINDOWS")).toBe(false);
    expect(shouldRequestAdminLandscapeLock("WEB_DESKTOP")).toBe(false);
  });

  it("wire values match the native plugin", () => {
    expect(nativeRouteModeValue("ADMIN_LANDSCAPE")).toBe("admin");
    expect(nativeRouteModeValue("DEFAULT")).toBe("default");
  });

  it("Android: SENSOR_LANDSCAPE only via applyForRoute for TABLET_ANDROID; reset on page start; re-apply on config change", () => {
    const policy = src("android/app/src/main/java/com/dibay/app/DibayAppOrientationPolicy.java");
    const plugin = src("android/app/src/main/java/com/dibay/app/DibayAppOrientationPlugin.java");
    const main = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const applyForRoute = policy.slice(
      policy.indexOf("public static void applyForRoute"),
      policy.indexOf("public static void resetRouteOnPageStarted"),
    );
    expect(applyForRoute).toContain("SCREEN_ORIENTATION_SENSOR_LANDSCAPE");
    expect(applyForRoute).toContain("SCREEN_ORIENTATION_UNSPECIFIED");
    expect(policy.split("ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE").length - 1).toBe(1);
    expect(policy).toContain('adminRoute && "TABLET_ANDROID".equals(deviceClass)');
    expect(plugin).toContain('@CapacitorPlugin(name = "DibayAppOrientation")');
    expect(plugin).toContain("DibayAppOrientationPolicy.applyForRoute(activity, adminRoute)");
    expect(plugin).toContain("runOnUiThread");
    expect(plugin).not.toContain("setRequestedOrientation");
    expect(main).toContain("registerPlugin(DibayAppOrientationPlugin.class);");
    const pageStarted = main.slice(main.indexOf("public void onMainFramePageStarted(String url)"));
    expect(pageStarted.slice(0, 400)).toContain("DibayAppOrientationPolicy.resetRouteOnPageStarted(MainActivity.this)");
    const configChanged = main.slice(main.indexOf("public void onConfigurationChanged"));
    expect(configChanged.slice(0, 500)).toContain("DibayAppOrientationPolicy.reapplyOnConfigurationChanged(this)");
    expect(main).not.toContain("SCREEN_ORIENTATION_SENSOR_LANDSCAPE");
  });

  it("Android: no restricted-resizability opt-out or manifest orientation", () => {
    const manifest = src("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toContain("PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY");
    expect(manifest).not.toContain("android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY");
  });

  it("iOS: landscape mask only when adminLandscape && TABLET_IPAD; reset on page load; no private API", () => {
    const policy = src("ios/App/App/Plugins/DibayAppOrientationPolicy.swift");
    const vc = src("ios/App/App/DibayRootBridgeViewController.swift");
    const plugin = src("ios/App/App/Plugins/DibayAppOrientationPlugin.swift");
    expect(policy).toContain('if adminLandscape && deviceClass == "TABLET_IPAD" {\n      return .landscape');
    expect(vc).toContain("adminLandscape: adminLandscape");
    expect(vc).toContain("setNeedsUpdateOfSupportedInterfaceOrientations()");
    expect(vc).toContain("requestGeometryUpdate(.iOS(interfaceOrientations: .landscape))");
    expect(vc).toContain("UIViewController.attemptRotationToDeviceOrientation()");
    expect(vc).toContain("installAdminLandscapeResetOnPageLoad()");
    expect(vc).toContain("DibayAppOrientationPlugin(),");
    expect(vc).not.toContain('setValue(UIInterfaceOrientation');
    expect(vc).not.toContain('forKey: "orientation"');
    expect(plugin).toContain('jsName = "DibayAppOrientation"');
    expect(plugin).toContain("CAPBridgedPlugin");
    expect(plugin).toContain("root.setAdminLandscape(adminRoute)");
    const pbx = src("ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx).toContain("DibayAppOrientationPlugin.swift in Sources");
  });

  it("JS: native plugin only, no screen.orientation.lock", () => {
    const wrapper = src("lib/device/dibay-app-orientation-native.ts");
    const hook = src("lib/device/use-dibay-admin-landscape-route-mode.ts");
    for (const file of [wrapper, hook]) {
      expect(file).not.toContain("screen.orientation");
      expect(file).not.toContain("setTimeout");
    }
    expect(src("components/admin/shell/AdminLandscapeGuard.tsx")).toContain("useDibayAdminLandscapeRouteMode()");
  });
});
