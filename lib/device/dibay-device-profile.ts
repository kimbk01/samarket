/**
 * DIBAY 기기 프로필 — 단일 정의 (S1, 2026-11-16 PHT)
 *
 * 기기 종류(FD1 DeviceClass)마다 「무엇을 다르게 하는가」를 이 표 한 곳에서만 정한다.
 * 형태(휴대폰·태블릿·데스크톱)·메뉴 위치·회전·관리자 가로 고정·시작 화면 대상·피드 스와이프는
 * 모두 `dibayDeviceProfile(deviceClass)` 로만 읽는다. 다른 파일에서 기기 종류 문자열을 직접 비교하지 않는다
 * (계약 시험 `dibay-device-profile.test.ts` 가 막는다).
 *
 * 네이티브(Android `DibayAppOrientationPolicy.java`·iOS `DibayAppOrientationPolicy.swift`)는 같은 값을
 * 자기 언어로 갖고 있고, 계약 시험이 이 표와 일치하는지 검사한다.
 *
 * S1 은 지금 동작을 그대로 옮긴 것이다(동작 변경 0). S2 에서 `DESKTOP_MAC`, S3 에서 웹뷰 배율·창 최소 크기를 더했다. 
 * 넓은 창 두 칸(S4)은 각 단계에서 이 표에 항목을 더한다.
 * 설계·시안: docs/audit/mac-ipad-iphone-device-layout-audit-2026-11-16.md §7,
 * docs/audit/device-shell-mockup-2026-11-16/profiles.js
 */

import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";

/** 화면 형태 3가지 + 판정 전. 기기 종류로만 정한다(창 폭·회전으로 바꾸지 않음 — FD4). */
export type DibayDeviceFamily = "PHONE" | "TABLET" | "DESKTOP" | "UNKNOWN";

/** 메인 메뉴 위치 */
export type DibayDeviceNavigation = "EXISTING_MAIN_BOTTOM_NAV" | "DESKTOP_SIDE_RAIL";

/** 앱 화면 회전 정책 (FD3) */
export type DibayDeviceOrientationPolicy =
  | "PORTRAIT_ONLY"
  | "PORTRAIT_AND_LANDSCAPE"
  | "RESIZABLE_DESKTOP"
  | "UNKNOWN_SAFE";

/** 시작 화면(인트로) 대상 — null 이면 「전체」 대상 인트로만 나온다 */
export type DibayDeviceLaunchIntroTarget = "phone" | "tablet" | null;

/** 이 기기 종류를 판정하는 네이티브 셸 (웹·Windows 는 null) */
export type DibayDeviceNativeShell = "android" | "ios" | null;

export type DibayDeviceProfile = {
  deviceClass: DibayDeviceClass;
  nativeShell: DibayDeviceNativeShell;
  family: DibayDeviceFamily;
  navigation: DibayDeviceNavigation;
  orientation: DibayDeviceOrientationPolicy;
  /** 네이티브가 앱 화면을 세로로 고정 요청 (Android MainActivity · iOS 루트 화면) */
  nativePortraitLock: boolean;
  /** 관리자 화면이 열려 있는 동안 네이티브 가로 고정 */
  adminLandscapeLock: boolean;
  launchIntroTarget: DibayDeviceLaunchIntroTarget;
  /** 커뮤니티 피드 주제 탭 좌우 스와이프 */
  feedTopicSwipe: boolean;
  /** 네이티브 웹뷰 배율 (S3) — Mac 만 1 ÷ 0.77 (iPad 앱 77% 축소를 되돌려 CSS 1px = Mac 1pt) */
  webViewZoom: number;
  /** 창 최소 크기 [가로, 세로] (S3) — Mac pt. null = 제한 없음 */
  minWindowPt: readonly [number, number] | null;
};

/** Mac 에서 iPad 앱이 그려지는 배율 (2026-11-16 실측: CSS 1056 → 814pt) */
export const DIBAY_MAC_IPAD_APP_SCALE = 0.77;

const PHONE = {
  family: "PHONE",
  navigation: "EXISTING_MAIN_BOTTOM_NAV",
  orientation: "PORTRAIT_ONLY",
  nativePortraitLock: true,
  adminLandscapeLock: false,
  launchIntroTarget: "phone",
  feedTopicSwipe: true,
  webViewZoom: 1,
  minWindowPt: null,
} as const;

const TABLET = {
  family: "TABLET",
  navigation: "EXISTING_MAIN_BOTTOM_NAV",
  orientation: "PORTRAIT_AND_LANDSCAPE",
  nativePortraitLock: false,
  adminLandscapeLock: true,
  launchIntroTarget: "tablet",
  feedTopicSwipe: false,
  webViewZoom: 1,
  minWindowPt: null,
} as const;

const DESKTOP = {
  family: "DESKTOP",
  navigation: "DESKTOP_SIDE_RAIL",
  orientation: "RESIZABLE_DESKTOP",
  nativePortraitLock: false,
  adminLandscapeLock: false,
  launchIntroTarget: null,
  feedTopicSwipe: false,
  webViewZoom: 1,
  minWindowPt: null,
} as const;

const UNKNOWN = {
  family: "UNKNOWN",
  navigation: "EXISTING_MAIN_BOTTOM_NAV",
  orientation: "UNKNOWN_SAFE",
  nativePortraitLock: false,
  adminLandscapeLock: false,
  launchIntroTarget: null,
  feedTopicSwipe: false,
  webViewZoom: 1,
  minWindowPt: null,
} as const;

/** 기기 종류 → 프로필. 새 기기 종류는 여기 한 줄을 더하면 모든 소비처가 따라간다. */
export const DIBAY_DEVICE_PROFILES: Readonly<Record<DibayDeviceClass, DibayDeviceProfile>> = {
  PHONE_ANDROID: { deviceClass: "PHONE_ANDROID", nativeShell: "android", ...PHONE },
  PHONE_IOS: { deviceClass: "PHONE_IOS", nativeShell: "ios", ...PHONE },
  TABLET_ANDROID: { deviceClass: "TABLET_ANDROID", nativeShell: "android", ...TABLET },
  TABLET_IPAD: { deviceClass: "TABLET_IPAD", nativeShell: "ios", ...TABLET },
  DESKTOP_WINDOWS: { deviceClass: "DESKTOP_WINDOWS", nativeShell: null, ...DESKTOP },
  /** S2 — Mac 은 Windows 와 같은 데스크톱 형태(왼쪽 세로 메뉴). iOS 바이너리라 nativeShell = ios. */
  DESKTOP_MAC: {
    deviceClass: "DESKTOP_MAC",
    nativeShell: "ios",
    ...DESKTOP,
    /** S3 — 77% 축소 되돌림 · 창 최소 380×550pt (Telegram Mac 최소 창과 같음) */
    webViewZoom: 1 / DIBAY_MAC_IPAD_APP_SCALE,
    minWindowPt: [380, 550],
  },
  WEB_DESKTOP: { deviceClass: "WEB_DESKTOP", nativeShell: null, ...DESKTOP },
  UNKNOWN: { deviceClass: "UNKNOWN", nativeShell: null, ...UNKNOWN },
};

export function dibayDeviceProfile(deviceClass: DibayDeviceClass): DibayDeviceProfile {
  return DIBAY_DEVICE_PROFILES[deviceClass] ?? DIBAY_DEVICE_PROFILES.UNKNOWN;
}

/** 이 프로필 값을 가진 기기 종류 목록 (네이티브 계약 대조·문서용) */
export function dibayDeviceClassesWhere(
  predicate: (profile: DibayDeviceProfile) => boolean,
): DibayDeviceClass[] {
  return (Object.keys(DIBAY_DEVICE_PROFILES) as DibayDeviceClass[]).filter((k) =>
    predicate(DIBAY_DEVICE_PROFILES[k]),
  );
}
