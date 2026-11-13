/**
 * DIBAY 앱 스토어 주소 — 앱 공유 착지 페이지(`/download`, Owner G-1 2026-11-14)·설치 안내 단일 정의.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §H-1 · G-13.
 *
 * - iOS: 번들 `com.dibay.ph` · App Store ID 6831952401 (Apple 공개 조회 PH·KR 확인 2026-11-14) — Owner G-13 「iOS 스토어 ID 사용 가능」.
 * - Android: 패키지 `com.dibay.app`. Play 공개 페이지가 404(2026-11-14 조회)라 Owner G-13 「Play 공개 확인 전 설치 CTA 보류」
 *   → `DIBAY_ANDROID_PLAY_STORE_PUBLIC = false` 동안 Android 설치 버튼을 그리지 않는다. 공개 확인 후 true 로 바꾼다.
 */
export const DIBAY_IOS_APP_STORE_ID = "6831952401" as const;
export const DIBAY_IOS_APP_STORE_URL = `https://apps.apple.com/app/id${DIBAY_IOS_APP_STORE_ID}` as const;

export const DIBAY_ANDROID_PACKAGE_ID = "com.dibay.app" as const;
export const DIBAY_ANDROID_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${DIBAY_ANDROID_PACKAGE_ID}` as const;
/** Play 공개 상태 확인 전 false — Owner G-13 */
export const DIBAY_ANDROID_PLAY_STORE_PUBLIC = false as boolean;

/** 앱 공유 착지 페이지 (공개 · 비로그인 열람) */
export const DIBAY_APP_LANDING_PATH = "/download" as const;
