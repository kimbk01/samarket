/**
 * DIBAY 앱 스토어 주소 — 앱 공유 착지 페이지(`/download`, Owner G-1 2026-11-14)·설치 안내 단일 정의.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §H-1 · G-13.
 *
 * - iOS: 번들 `com.dibay.ph` · App Store ID 6831952401 (Apple 공개 조회 PH·KR 확인 2026-11-14) — Owner G-13 「iOS 스토어 ID 사용 가능」.
 * - Android: 패키지 `com.dibay.app`. Play 공개 페이지가 404(2026-11-14 조회)라 Owner G-13 「Play 공개 확인 전 설치 CTA 보류」
 *   → `DIBAY_ANDROID_PLAY_STORE_PUBLIC = false` 동안 Android 설치 버튼을 그리지 않는다. 공개 확인 후 true 로 바꾼다.
 * - 2026-11-20: Play 공개 페이지 200 확인(프로덕션 1.2.7) → true.
 * - 스티커 QR(`/download?go=1`)은 기기별 스토어로 바로 보낸다. iOS 는 나라 없는 주소가 웹에서 404(11-20 조회)라
 *   공개 스토어(필리핀) 주소를 쓴다 — PH·KR 모두 200 확인.
 */
export const DIBAY_IOS_APP_STORE_ID = "6831952401" as const;
export const DIBAY_IOS_APP_STORE_URL = `https://apps.apple.com/app/id${DIBAY_IOS_APP_STORE_ID}` as const;

export const DIBAY_ANDROID_PACKAGE_ID = "com.dibay.app" as const;
export const DIBAY_ANDROID_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${DIBAY_ANDROID_PACKAGE_ID}` as const;
/** Play 공개 확인(2026-11-20) — Owner G-13 */
export const DIBAY_ANDROID_PLAY_STORE_PUBLIC = true as boolean;

/** 스티커 QR 기기별 이동용 iOS 주소 (웹에서도 열리는 필리핀 스토어) */
export const DIBAY_IOS_APP_STORE_REDIRECT_URL = `https://apps.apple.com/ph/app/id${DIBAY_IOS_APP_STORE_ID}` as const;

/** 스티커 QR 1개 — 열면 iPhone·iPad 는 App Store, Android 는 Google Play 로 바로 보낸다 */
export const DIBAY_APP_STORE_GO_QUERY = "go" as const;

/**
 * 기기별 스토어 주소. iPhone·iPad(iPadOS 데스크톱 모드 포함)·Android 외에는 null(착지 화면 그대로).
 */
export function resolveDeviceStoreUrl(userAgent: string, maxTouchPoints = 0): string | null {
  const ua = userAgent || "";
  if (/android/i.test(ua)) return DIBAY_ANDROID_PLAY_STORE_PUBLIC ? DIBAY_ANDROID_PLAY_STORE_URL : null;
  if (/iphone|ipad|ipod/i.test(ua)) return DIBAY_IOS_APP_STORE_REDIRECT_URL;
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return DIBAY_IOS_APP_STORE_REDIRECT_URL;
  return null;
}

/** 앱 공유 착지 페이지 (공개 · 비로그인 열람) */
export const DIBAY_APP_LANDING_PATH = "/download" as const;
