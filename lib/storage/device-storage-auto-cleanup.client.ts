"use client";

/**
 * 기기 저장공간 S1 (Owner 「권장안대로」 2026-11-19) — 하루 1회 자동 정리.
 * 레거시(텔레그램 Keep Media 등)처럼 「다시 받을 수 있고 오래 안 쓴 것」만 지운다. 서버 요청 0.
 * 근거: docs/audit/device-storage-legacy-design-2026-11-19.md §2-1 · §4 S1
 *
 * 지우는 것(코드로 확인한 누수):
 * - `samarket:home-posts:local:v1:*` — 24h 만료돼도 같은 키를 다시 읽을 때만 지워져 영구히 남던 목록 사본
 *   (`lib/posts/getPostsForHome.ts:187-189`). 만료된 것과 읽을 수 없는 값만 삭제.
 * - `samarket:price-offers-bump:*` — 다른 탭 신호용 값(읽는 곳 없음 · `normalize-offer-product-id.ts:31`). 7일 지난 것 삭제.
 * - `samarket:cm_notification_dismissed_ids` — 닫을 때마다 늘던 배열 → 최근 500개만.
 * 지키는 것: 로그인·설정·초안·사진첩 저장분 등 그 밖의 모든 키(위 3종 외 건드리지 않음).
 */

export const DEVICE_STORAGE_CLEANUP_LAST_RUN_KEY = "dibay:device-storage-cleanup:last-run";
export const DEVICE_STORAGE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const HOME_POSTS_LOCAL_PREFIX = "samarket:home-posts:local:v1:";
export const PRICE_OFFERS_BUMP_PREFIX = "samarket:price-offers-bump:";
export const PRICE_OFFERS_BUMP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CM_NOTIFICATION_DISMISSED_IDS_KEY = "samarket:cm_notification_dismissed_ids";
export const CM_NOTIFICATION_DISMISSED_IDS_MAX = 500;

export type DeviceStorageCleanupResult = {
  ran: boolean;
  homePostsRemoved: number;
  offerBumpsRemoved: number;
  dismissedIdsTrimmed: number;
};

function listKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

/** 닫은 알림 id — 최근 N개만(끝에 덧붙이는 구조라 뒤쪽이 최근) */
export function trimDismissedIds(ids: string[], max = CM_NOTIFICATION_DISMISSED_IDS_MAX): string[] {
  return ids.length > max ? ids.slice(ids.length - max) : ids;
}

export function runDeviceStorageCleanupNow(storage: Storage, nowMs = Date.now()): Omit<DeviceStorageCleanupResult, "ran"> {
  let homePostsRemoved = 0;
  let offerBumpsRemoved = 0;
  let dismissedIdsTrimmed = 0;

  for (const key of listKeys(storage)) {
    if (key.startsWith(HOME_POSTS_LOCAL_PREFIX)) {
      let expired = true;
      try {
        const parsed = JSON.parse(storage.getItem(key) ?? "") as { expiresAt?: unknown };
        expired = !(typeof parsed?.expiresAt === "number" && parsed.expiresAt >= nowMs);
      } catch {
        expired = true;
      }
      if (expired) {
        storage.removeItem(key);
        homePostsRemoved += 1;
      }
      continue;
    }
    if (key.startsWith(PRICE_OFFERS_BUMP_PREFIX)) {
      const at = Number(storage.getItem(key));
      if (!Number.isFinite(at) || nowMs - at > PRICE_OFFERS_BUMP_MAX_AGE_MS) {
        storage.removeItem(key);
        offerBumpsRemoved += 1;
      }
    }
  }

  try {
    const raw = storage.getItem(CM_NOTIFICATION_DISMISSED_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > CM_NOTIFICATION_DISMISSED_IDS_MAX) {
        const ids = parsed.filter((x): x is string => typeof x === "string");
        const trimmed = trimDismissedIds(ids);
        dismissedIdsTrimmed = parsed.length - trimmed.length;
        storage.setItem(CM_NOTIFICATION_DISMISSED_IDS_KEY, JSON.stringify(trimmed));
      }
    }
  } catch {
    /* 읽을 수 없는 값은 그대로 둔다(읽는 쪽이 빈 목록으로 처리) */
  }

  return { homePostsRemoved, offerBumpsRemoved, dismissedIdsTrimmed };
}

/** 하루 1회만 실행. 저장소 접근 불가(사생활 보호 모드 등)면 아무것도 하지 않는다. */
export function runDeviceStorageAutoCleanupDaily(nowMs = Date.now()): DeviceStorageCleanupResult {
  const none: DeviceStorageCleanupResult = { ran: false, homePostsRemoved: 0, offerBumpsRemoved: 0, dismissedIdsTrimmed: 0 };
  if (typeof window === "undefined") return none;
  try {
    const storage = window.localStorage;
    const last = Number(storage.getItem(DEVICE_STORAGE_CLEANUP_LAST_RUN_KEY));
    if (Number.isFinite(last) && last > 0 && nowMs - last < DEVICE_STORAGE_CLEANUP_INTERVAL_MS) return none;
    storage.setItem(DEVICE_STORAGE_CLEANUP_LAST_RUN_KEY, String(nowMs));
    return { ran: true, ...runDeviceStorageCleanupNow(storage, nowMs) };
  } catch {
    return none;
  }
}
