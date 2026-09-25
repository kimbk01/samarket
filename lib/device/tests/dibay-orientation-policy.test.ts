import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  orientationPolicyForDeviceClass,
  shouldLockIosAppPortrait,
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
    const vc = src("ios/App/App/DibayStartupBridgeViewController.swift");
    const plugin = src("ios/App/App/Plugins/DibayDeviceClassPlugin.swift");
    const classifier = src("ios/App/App/Plugins/DibayDeviceClassClassifier.swift");
    expect(classifier).toContain(".phone");
    expect(classifier).toContain("PHONE_IOS");
    expect(plugin).toContain("DibayDeviceClassClassifier.classify()");
    expect(vc).toContain("DibayAppOrientationPolicy.supportedInterfaceOrientations");
    expect(vc).toContain("DibayDeviceClassClassifier.classify()");
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
