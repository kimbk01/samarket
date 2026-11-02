import { storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";

const OWNER_DASHBOARD_PATH = "/stores/owner";

function ownerDashboardPath(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** 오너 하단 「홈」— 운영 대시보드(`/stores/owner`)에서 홈 원 선택 표시 */
export function isOwnerHomeHubBottomNavActive(pathname: string | null): boolean {
  return ownerDashboardPath(pathname) === OWNER_DASHBOARD_PATH;
}

/**
 * 오너 하단 「홈」 목적지 — 해당 오너의 배달 매장 화면(`/stores/{slug}`).
 * Owner S-B 2026-11-03: 다이얼(FAB) 제거 · 「매장으로 이동합니다」 확인 후 이동. slug 없으면 null(이동 불가 안내).
 */
export function resolveOwnerHomeStoreHref(storeSlug: string | null | undefined): string | null {
  const slug = typeof storeSlug === "string" ? storeSlug.trim() : "";
  return slug ? storeDetailHrefFromSlug(slug) : null;
}

/** 확인창 「확인」 — 작성 중 시트 가드 통과 시에만 이동 */
export function runOwnerHomeStoreNavigation(args: {
  href: string;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  push: (href: string) => void;
}): boolean {
  const href = args.href.trim();
  if (!href) return false;
  if (!args.guardBeforeNavigate(href)) return false;
  args.push(href);
  return true;
}
