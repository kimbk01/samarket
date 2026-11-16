import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIBAY_DEVICE_CLASSES, type DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
  DIBAY_DESKTOP_MIN_WINDOW,
  DIBAY_MAC_IPAD_APP_SCALE,
  DIBAY_DEVICE_PROFILES,
  dibayDeviceClassesWhere,
  dibayDeviceProfile,
} from "@/lib/device/dibay-device-profile";
import { layoutFamilyForDeviceClass } from "@/lib/device/dibay-layout-resolver";
import {
  orientationPolicyForDeviceClass,
  shouldLockIosAppPortrait,
  shouldRequestAdminLandscapeLock,
  shouldRequestAndroidAppPortrait,
} from "@/lib/device/dibay-orientation-policy";
import { resolveAppShell } from "@/lib/device/dibay-shell-resolver";
import { launchIntroTargetMatches } from "@/lib/launch-intro/target";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("기기 프로필 단일 정의 (S1)", () => {
  it("모든 기기 종류가 프로필을 갖는다", () => {
    for (const dc of DIBAY_DEVICE_CLASSES) {
      expect(DIBAY_DEVICE_PROFILES[dc].deviceClass).toBe(dc);
    }
    expect(Object.keys(DIBAY_DEVICE_PROFILES).sort()).toEqual([...DIBAY_DEVICE_CLASSES].sort());
  });

  it("프로필 값 고정표 (S1 = 지금 동작 그대로)", () => {
    const table = Object.fromEntries(
      DIBAY_DEVICE_CLASSES.map((dc) => {
        const p = DIBAY_DEVICE_PROFILES[dc];
        return [
          dc,
          [p.nativeShell, p.family, p.navigation, p.orientation, p.nativePortraitLock, p.adminLandscapeLock, p.launchIntroTarget, p.feedTopicSwipe, p.sideRailMinWidthCss, p.sideRailLandscapeOnly],
        ];
      }),
    );
    expect(table).toEqual({
      PHONE_ANDROID: ["android", "PHONE", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_ONLY", true, false, "phone", true, null, false],
      PHONE_IOS: ["ios", "PHONE", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_ONLY", true, false, "phone", true, null, false],
      TABLET_ANDROID: ["android", "TABLET", "DESKTOP_SIDE_RAIL", "PORTRAIT_AND_LANDSCAPE", false, true, "tablet", false, 600, true],
      TABLET_IPAD: ["ios", "TABLET", "DESKTOP_SIDE_RAIL", "PORTRAIT_AND_LANDSCAPE", false, true, "tablet", false, 600, true],
      DESKTOP_WINDOWS: [null, "DESKTOP", "DESKTOP_SIDE_RAIL", "RESIZABLE_DESKTOP", false, false, null, false, 0, false],
      DESKTOP_MAC: ["ios", "DESKTOP", "DESKTOP_SIDE_RAIL", "RESIZABLE_DESKTOP", false, false, null, false, 0, false],
      WEB_DESKTOP: [null, "DESKTOP", "DESKTOP_SIDE_RAIL", "RESIZABLE_DESKTOP", false, false, null, false, 0, false],
      UNKNOWN: [null, "UNKNOWN", "EXISTING_MAIN_BOTTOM_NAV", "UNKNOWN_SAFE", false, false, null, false, null, false],
    });
  });

  it("소비처는 모두 프로필 값을 그대로 낸다", () => {
    for (const dc of DIBAY_DEVICE_CLASSES) {
      const p = dibayDeviceProfile(dc);
      expect(layoutFamilyForDeviceClass(dc)).toBe(p.family);
      expect(orientationPolicyForDeviceClass(dc)).toBe(p.orientation);
      expect(shouldRequestAdminLandscapeLock(dc)).toBe(p.adminLandscapeLock);
      expect(shouldRequestAndroidAppPortrait(dc)).toBe(p.nativePortraitLock && p.nativeShell === "android");
      expect(shouldLockIosAppPortrait(dc)).toBe(p.nativePortraitLock && p.nativeShell === "ios");
      expect(resolveAppShell({ deviceClass: dc, layoutMode: "UNKNOWN_SAFE" }).navigationPresentation).toBe(p.navigation);
      expect(launchIntroTargetMatches("all", dc)).toBe(true);
      expect(launchIntroTargetMatches("phone", dc)).toBe(p.launchIntroTarget === "phone");
      expect(launchIntroTargetMatches("tablet", dc)).toBe(p.launchIntroTarget === "tablet");
    }
  });
});

describe("네이티브 값이 프로필 표와 같다", () => {
  const javaPolicy = read("android/app/src/main/java/com/dibay/app/DibayAppOrientationPolicy.java");
  const swiftPolicy = read("ios/App/App/Plugins/DibayAppOrientationPolicy.swift");
  const swiftRoot = read("ios/App/App/DibayRootBridgeViewController.swift");

  const expectOnly = (shell: "android" | "ios", pick: (p: (typeof DIBAY_DEVICE_PROFILES)[DibayDeviceClass]) => boolean) =>
    dibayDeviceClassesWhere((p) => p.nativeShell === shell && pick(p));

  it("Android 세로 고정·관리자 가로 고정", () => {
    const portrait = [...javaPolicy.matchAll(/shouldRequestPortrait\(String deviceClass\)\s*\{\s*return "(\w+)"\.equals\(deviceClass\)/g)].map((m) => m[1]);
    expect(portrait).toEqual(expectOnly("android", (p) => p.nativePortraitLock));
    const admin = [...javaPolicy.matchAll(/adminRoute && "(\w+)"\.equals\(deviceClass\)/g)].map((m) => m[1]);
    expect(admin).toEqual(expectOnly("android", (p) => p.adminLandscapeLock));
  });

  it("iOS 세로 고정·관리자 가로 고정", () => {
    const portrait = [...swiftPolicy.matchAll(/case "(\w+)":\s*return \.portrait\b/g)].map((m) => m[1]);
    expect(portrait).toEqual(expectOnly("ios", (p) => p.nativePortraitLock));
    const admin = [...swiftPolicy.matchAll(/adminLandscape && deviceClass == "(\w+)"/g)].map((m) => m[1]);
    expect(admin).toEqual(expectOnly("ios", (p) => p.adminLandscapeLock));
    const rootAdmin = [...swiftRoot.matchAll(/classify\(\)\.deviceClass == "(\w+)"/g)].map((m) => m[1]);
    expect(rootAdmin).toEqual(expectOnly("ios", (p) => p.adminLandscapeLock));
  });

  it("iOS 판정: Mac 은 idiom 보다 먼저 DESKTOP_MAC (S2)", () => {
    const classifier = read("ios/App/App/Plugins/DibayDeviceClassClassifier.swift");
    const macAt = classifier.indexOf('if isIOSAppOnMac {');
    const idiomAt = classifier.indexOf("switch idiom {");
    expect(macAt).toBeGreaterThan(0);
    expect(macAt).toBeLessThan(idiomAt);
    expect(classifier).toContain('Result(deviceClass: "DESKTOP_MAC", source: "ios_app_on_mac"');
    expect(classifier).toContain("isIOSAppOnMac: Bool = DibayCallPlatformCapability.isIOSAppOnMac");
    expect(classifier).not.toContain("ProcessInfo.processInfo.isiOSAppOnMac");
    const iosClasses = dibayDeviceClassesWhere((p) => p.nativeShell === "ios");
    expect(iosClasses).toEqual(["PHONE_IOS", "TABLET_IPAD", "DESKTOP_MAC"]);
    expect(dibayDeviceProfile("DESKTOP_MAC").navigation).toBe(dibayDeviceProfile("DESKTOP_WINDOWS").navigation);
  });
});

describe("S3 웹뷰 배율·창 최소 크기 = 표 값 (네이티브 일치)", () => {
  const swift = read("ios/App/App/Plugins/DibayDeviceClassClassifier.swift");

  it("배율은 Mac 만 · 창 최소는 Windows·Mac 같은 값(세로 메뉴 72 + 가장 작은 휴대폰 375×667)", () => {
    expect(DIBAY_DESKTOP_MIN_WINDOW).toEqual([447, 667]);
    for (const dc of DIBAY_DEVICE_CLASSES) {
      const p = dibayDeviceProfile(dc);
      expect(p.webViewZoom).toBe(dc === "DESKTOP_MAC" ? 1 / 0.77 : 1);
      if (dc === "DESKTOP_MAC" || dc === "DESKTOP_WINDOWS") expect(p.minWindowPt).toEqual([447, 667]);
      else expect(p.minWindowPt).toBeNull();
    }
  });

  it("Swift 상수·대상 기기 = 표", () => {
    expect(swift).toContain(`static let macIpadAppScale: CGFloat = ${DIBAY_MAC_IPAD_APP_SCALE}`);
    const [w, h] = dibayDeviceProfile("DESKTOP_MAC").minWindowPt!;
    expect(swift).toContain(`static let macMinimumWindowPt = CGSize(width: ${w}, height: ${h})`);
    const zoomTargets = [...swift.matchAll(/deviceClass == "(\w+)" \? 1\.0 \/ macIpadAppScale/g)].map((m) => m[1]);
    expect(zoomTargets).toEqual(dibayDeviceClassesWhere((p) => p.webViewZoom !== 1));
    const minTargets = [...swift.matchAll(/guard deviceClass == "(\w+)" else \{ return nil \}/g)].map((m) => m[1]);
    // iOS 바이너리가 적용하는 최소 창은 Mac 만 (Windows 는 Windows 셸)
    expect(minTargets).toEqual(dibayDeviceClassesWhere((p) => p.minWindowPt != null && p.nativeShell === "ios"));
    expect(read("ios/App/App/DibayRootBridgeViewController.swift")).toContain("DibayDeviceProfileNative.webViewPageZoom(");
    expect(read("ios/App/App/SceneDelegate.swift")).toContain("DibayDeviceProfileNative.minimumSceneSize(");
  });
});

describe("기기 종류 직접 비교 금지 (프로필 표만 읽는다)", () => {
  const ROOTS = ["lib", "components", "hooks", "app"];
  /** 판정 자체를 하는 파일만 기기 종류 문자열을 비교할 수 있다 */
  const ALLOWED = new Set(["lib/device/dibay-device-class.ts", "lib/device/dibay-device-profile.ts"]);
  const PATTERN =
    /(?:===|!==)\s*"(?:PHONE_ANDROID|PHONE_IOS|TABLET_ANDROID|TABLET_IPAD|DESKTOP_WINDOWS|DESKTOP_MAC|WEB_DESKTOP)"|"(?:PHONE_ANDROID|PHONE_IOS|TABLET_ANDROID|TABLET_IPAD|DESKTOP_WINDOWS|DESKTOP_MAC|WEB_DESKTOP)"\s*(?:===|!==)/;

  function walk(dir: string, out: string[]) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__" || name === "tests") continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  }

  it("앱 코드에 기기 종류 문자열 비교가 없다", () => {
    const files: string[] = [];
    for (const r of ROOTS) walk(path.resolve(process.cwd(), r), files);
    const offenders = files
      .map((f) => path.relative(process.cwd(), f))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => PATTERN.test(read(rel)));
    expect(offenders).toEqual([]);
  });
});
