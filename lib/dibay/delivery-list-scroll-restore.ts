"use client";

/**
 * 배달 목록·매장 상세 경로 판별 (키·경로 helper).
 * 목록 → 매장 → 뒤로 위치 복원은 앱 공용 규칙(`lib/navigation/app-scroll-memory.ts`)과
 * browse↔매장 슬라이드 셸(`DeliveryPresentationShell`)이 한다 — 이 모듈은 위치를 저장·복원하지 않는다 (스크롤 SSOT 2026-11-03).
 */

export function buildDeliveryListScrollRouteKey(pathname: string, search?: string): string {
  const p = (pathname || "").split("?")[0] || "/";
  const q = (search ?? "").replace(/^\?/, "").trim();
  return q ? `${p}?${q}` : p;
}

export function isDeliveryListScrollRoute(routeKey: string): boolean {
  const path = (routeKey || "").split("?")[0] ?? "";
  if (path === "/stores" || path === "/stores/search" || path === "/search") return true;
  return /^\/stores\/browse\/[^/]+$/.test(path);
}

/** 소비자 매장 상세·하위 경로(`/stores/:slug`, cart 등) — 목록 browse/search/owner 제외 */
export function isStoreConsumerDetailPath(pathname: string): boolean {
  const path = (pathname || "").split("?")[0] ?? "";
  if (!path.startsWith("/stores/")) return false;
  if (isDeliveryListScrollRoute(path)) return false;
  if (path === "/stores/search" || path.startsWith("/stores/owner")) return false;
  const parts = path.split("/").filter(Boolean);
  /** 상품권몰은 매장 화면이 아니다 — 배달 홈 「선물하기」 아이콘에서 들어와도 매장 껍데기(slug=gift-mall)로 열지 않는다 */
  if (parts[1] === "gift-mall") return false;
  return parts[0] === "stores" && parts.length >= 2;
}
