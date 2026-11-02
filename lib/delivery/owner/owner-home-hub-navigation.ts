import { storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";

const OWNER_DASHBOARD_PATH = "/stores/owner";

function ownerDashboardPath(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** 오너 하단 「홈」— 운영 대시보드(`/stores/owner`)에서 홈 원 선택 표시 */
export function isOwnerHomeHubBottomNavActive(pathname: string | null): boolean {
  return ownerDashboardPath(pathname) === OWNER_DASHBOARD_PATH;
}

export type OwnerHomeStoreTarget =
  | { kind: "store"; href: string }
  /** 배달 매장 화면이 「매장을 찾을 수 없음」이 되는 경우 — 이동하지 않고 안내만 */
  | { kind: "unavailable"; reason: "not_approved" | "hidden" | "no_slug" };

/**
 * 오너 하단 「홈」 목적지 — 해당 오너의 배달 매장 화면(`/stores/{slug}`).
 * Owner S-B 2026-11-03: 다이얼(FAB) 제거 · 「매장으로 이동합니다」 확인 후 이동.
 * 배달 매장 화면은 승인 + 노출 ON 매장만 연다(`getApprovedStoreBySlug`) — 그 밖은 안내만.
 */
export function resolveOwnerHomeStoreTarget(store: {
  slug: string | null | undefined;
  approvalStatus: string | null | undefined;
  isVisible: boolean | null | undefined;
}): OwnerHomeStoreTarget {
  const slug = typeof store.slug === "string" ? store.slug.trim() : "";
  if (String(store.approvalStatus ?? "") !== "approved") return { kind: "unavailable", reason: "not_approved" };
  if (store.isVisible !== true) return { kind: "unavailable", reason: "hidden" };
  if (!slug) return { kind: "unavailable", reason: "no_slug" };
  return { kind: "store", href: storeDetailHrefFromSlug(slug) };
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
