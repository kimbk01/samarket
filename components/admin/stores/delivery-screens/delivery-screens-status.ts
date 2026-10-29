/**
 * 5-F 「배달 화면 구성」 허브 — 구역 현황 숫자 (기존 조회 API 만 사용, 새 API·테이블 없음).
 * - 광고 집행 수: GET /api/admin/delivery-ads (inventory·업종 필터 · 서버 페이지 limit=1) → `policyCounts`
 * - 히어로 용량·점유: GET /api/admin/advertising/placement-inventory → `inventory.hero`
 */

import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { PlacementInventoryModel } from "@/lib/admin/ads-exposure/placement-inventory";

export type DeliveryScreensTab = "home" | "browse" | "taxonomy";

export const DELIVERY_SCREENS_TABS: readonly { id: DeliveryScreensTab; labelKo: string; labelEn: string }[] = [
  { id: "home", labelKo: "홈 화면", labelEn: "Home screen" },
  /** id 는 기존 링크 호환을 위해 `browse` 유지 (WP2: 메뉴 구성 + 기존 업종 목록 정책) */
  { id: "browse", labelKo: "메뉴 구성", labelEn: "Menus" },
  { id: "taxonomy", labelKo: "업종 분류", labelEn: "Category taxonomy" },
];

export const DELIVERY_SCREENS_ROUTE = "/admin/delivery-screens";

/** 조회 결과 — 실패는 「값 없음」과 구분한다 (v4 UI-06). */
export type DeliveryScreensFetchResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; status?: number };

/**
 * v4 PERF-18 — 집행 수만 필요하므로 목록 500건 대신 서버 페이지 보기(`view=all&offset=0&limit=1`)를 쓴다.
 * 같은 RPC 가 상한 없는 전체 기준 `policyCounts` 를 함께 돌려준다 (기존 GET 재사용 · 새 API 없음).
 */
export function deliveryAdPolicyCountsQuery(input: {
  inventory: string;
  product?: "store_sponsored" | "banner" | null;
  primarySlug?: string | null;
  subSlug?: string | null;
}): string {
  const qs = new URLSearchParams({ inventory: input.inventory, view: "all", offset: "0", limit: "1" });
  if (input.product) qs.set("product", input.product);
  if (input.primarySlug?.trim()) qs.set("primarySlug", input.primarySlug.trim());
  if (input.subSlug?.trim()) qs.set("subSlug", input.subSlug.trim());
  return qs.toString();
}

export async function fetchDeliveryAdPolicyCountsResult(input: {
  inventory: string;
  product?: "store_sponsored" | "banner" | null;
  primarySlug?: string | null;
  subSlug?: string | null;
}): Promise<DeliveryScreensFetchResult<PolicyCampaignCounts>> {
  try {
    const res = await fetch(`/api/admin/delivery-ads?${deliveryAdPolicyCountsQuery(input)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      policyCounts?: PolicyCampaignCounts | null;
    };
    if (res.ok && json.ok && json.policyCounts) return { ok: true, value: json.policyCounts };
    return { ok: false, code: json.error || "load_failed", status: res.status };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export async function fetchDeliveryAdPolicyCounts(input: {
  inventory: string;
  primarySlug?: string | null;
  subSlug?: string | null;
}): Promise<PolicyCampaignCounts | null> {
  const r = await fetchDeliveryAdPolicyCountsResult(input);
  return r.ok ? r.value : null;
}

export async function fetchHeroPlacementResult(): Promise<
  DeliveryScreensFetchResult<PlacementInventoryModel["hero"]>
> {
  try {
    const res = await fetch("/api/admin/advertising/placement-inventory", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      inventory?: PlacementInventoryModel;
    };
    if (res.ok && json.ok && json.inventory) return { ok: true, value: json.inventory.hero };
    return { ok: false, code: json.error || "load_failed", status: res.status };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export async function fetchHeroPlacement(): Promise<PlacementInventoryModel["hero"] | null> {
  const r = await fetchHeroPlacementResult();
  return r.ok ? r.value : null;
}
