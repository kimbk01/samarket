/** 하단 「내정보」(`/mypage`) 진입 직전 셸 — 배달 5탭 vs 거래·커뮤니티 6탭 레일 */
export type MypageBottomNavOrigin = "delivery" | "trade" | "community";

const STORAGE_KEY = "sam.mypage.bottomNavOrigin.v1";

function mypageOriginSessionStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage !== "undefined" ? globalThis.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readStoredMypageBottomNavOrigin(): MypageBottomNavOrigin | null {
  const storage = mypageOriginSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === "delivery" || raw === "trade" || raw === "community") return raw;
  } catch {
    /* private mode */
  }
  return null;
}

export function writeStoredMypageBottomNavOrigin(origin: MypageBottomNavOrigin): void {
  const storage = mypageOriginSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, origin);
  } catch {
    /* quota */
  }
}

export function mypageBottomNavOriginToSecondaryRail(
  origin: MypageBottomNavOrigin | null
): "stores" | "trade" | "philife" {
  if (origin === "delivery") return "stores";
  if (origin === "trade") return "trade";
  return "philife";
}
