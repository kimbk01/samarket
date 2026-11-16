import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIBAY_DEVICE_CLASSES, type DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
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
          [p.nativeShell, p.family, p.navigation, p.orientation, p.nativePortraitLock, p.adminLandscapeLock, p.launchIntroTarget, p.feedTopicSwipe],
        ];
      }),
    );
    expect(table).toEqual({
      PHONE_ANDROID: ["android", "PHONE", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_ONLY", true, false, "phone", true],
      PHONE_IOS: ["ios", "PHONE", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_ONLY", true, false, "phone", true],
      TABLET_ANDROID: ["android", "TABLET", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_AND_LANDSCAPE", false, true, "tablet", false],
      TABLET_IPAD: ["ios", "TABLET", "EXISTING_MAIN_BOTTOM_NAV", "PORTRAIT_AND_LANDSCAPE", false, true, "tablet", false],
      DESKTOP_WINDOWS: [null, "DESKTOP", "DESKTOP_SIDE_RAIL", "RESIZABLE_DESKTOP", false, false, null, false],
      WEB_DESKTOP: [null, "DESKTOP", "DESKTOP_SIDE_RAIL", "RESIZABLE_DESKTOP", false, false, null, false],
      UNKNOWN: [null, "UNKNOWN", "EXISTING_MAIN_BOTTOM_NAV", "UNKNOWN_SAFE", false, false, null, false],
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
});

describe("기기 종류 직접 비교 금지 (프로필 표만 읽는다)", () => {
  const ROOTS = ["lib", "components", "hooks", "app"];
  /** 판정 자체를 하는 파일만 기기 종류 문자열을 비교할 수 있다 */
  const ALLOWED = new Set(["lib/device/dibay-device-class.ts", "lib/device/dibay-device-profile.ts"]);
  const PATTERN =
    /(?:===|!==)\s*"(?:PHONE_ANDROID|PHONE_IOS|TABLET_ANDROID|TABLET_IPAD|DESKTOP_WINDOWS|WEB_DESKTOP)"|"(?:PHONE_ANDROID|PHONE_IOS|TABLET_ANDROID|TABLET_IPAD|DESKTOP_WINDOWS|WEB_DESKTOP)"\s*(?:===|!==)/;

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
