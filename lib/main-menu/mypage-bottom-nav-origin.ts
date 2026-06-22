/** 하단 「내정보」(`/mypage`) 진입 직전 셸 — 배달 5탭 vs 거래·커뮤니티 6탭 레일 */
import { isDeliveryConsumerBottomNavSurface } from "@/lib/main-menu/delivery-bottom-nav-layout";

export type MypageBottomNavOrigin = "delivery" | "trade" | "community";

const STORAGE_KEY = "sam.mypage.bottomNavOrigin.v1";
const BACK_PATH_KEY = "sam.mypage.backPath.v1";

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

export function mypageBottomNavOriginToHref(origin: MypageBottomNavOrigin | null): string {
  if (origin === "delivery") return "/stores";
  if (origin === "trade") return "/market";
  return "/philife";
}

function isMypageSurfacePath(pathname: string): boolean {
  return (
    pathname === "/mypage" ||
    pathname.startsWith("/mypage/") ||
    pathname === "/my" ||
    pathname.startsWith("/my/")
  );
}

export function writeStoredMypageBackPath(href: string): void {
  const trimmed = href.trim();
  if (!trimmed || !trimmed.startsWith("/") || isMypageSurfacePath(trimmed.split("?")[0] ?? "")) {
    return;
  }
  const storage = mypageOriginSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(BACK_PATH_KEY, trimmed);
  } catch {
    /* quota */
  }
}

export function readStoredMypageBackPath(): string | null {
  const storage = mypageOriginSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BACK_PATH_KEY)?.trim();
    if (!raw || !raw.startsWith("/")) return null;
    const pathOnly = raw.split("?")[0]?.trim().replace(/\/+$/, "") || "/";
    if (isMypageSurfacePath(pathOnly)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** 내정보 홈 뒤로가기 폴백 — 직전 비-내정보 경로 우선, 없으면 탭 origin 허브 */
export function resolveMypageBackFallbackHref(): string {
  return readStoredMypageBackPath() ?? mypageBottomNavOriginToHref(readStoredMypageBottomNavOrigin());
}

/**
 * 하단 탭 레일 origin + 직전 전체 경로(쿼리 포함)를 sessionStorage 에 동기화.
 * `/mypage` 에 머무는 동안 backPath 는 덮어쓰지 않는다.
 */
export function syncMypageBottomNavContextFromPath(pathname: string | null, searchQuery = ""): void {
  const pathOnly = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";

  if (!isMypageSurfacePath(pathOnly)) {
    const fullHref = searchQuery ? `${pathOnly}?${searchQuery}` : pathOnly;
    writeStoredMypageBackPath(fullHref);
  }

  if (isDeliveryConsumerBottomNavSurface(pathOnly) || pathOnly === "/orders" || pathOnly.startsWith("/orders/")) {
    writeStoredMypageBottomNavOrigin("delivery");
    return;
  }
  if (pathOnly === "/market" || pathOnly.startsWith("/market/")) {
    writeStoredMypageBottomNavOrigin("trade");
    return;
  }
  if (
    pathOnly === "/philife" ||
    pathOnly.startsWith("/philife/") ||
    pathOnly === "/community" ||
    pathOnly.startsWith("/community/")
  ) {
    writeStoredMypageBottomNavOrigin("community");
  }
}
