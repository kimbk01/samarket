/**
 * 5-F 「배달 화면 구성」 허브 — 구역 현황 숫자 (기존 조회 API 만 사용, 새 API·테이블 없음).
 * - 광고 집행 수: GET /api/admin/delivery-ads (inventory·업종 필터) → `policyCounts`
 * - 히어로 용량·점유: GET /api/admin/advertising/placement-inventory → `inventory.hero`
 */

import type { PolicyCampaignCounts } from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import type { PlacementInventoryModel } from "@/lib/admin/ads-exposure/placement-inventory";

export type DeliveryScreensTab = "home" | "browse" | "taxonomy";

export const DELIVERY_SCREENS_TABS: readonly { id: DeliveryScreensTab; labelKo: string; labelEn: string }[] = [
  { id: "home", labelKo: "홈 화면", labelEn: "Home screen" },
  { id: "browse", labelKo: "업종 목록 화면", labelEn: "Category list screen" },
  { id: "taxonomy", labelKo: "업종 분류", labelEn: "Category taxonomy" },
];

export const DELIVERY_SCREENS_ROUTE = "/admin/delivery-screens";

export async function fetchDeliveryAdPolicyCounts(input: {
  inventory: string;
  primarySlug?: string | null;
  subSlug?: string | null;
}): Promise<PolicyCampaignCounts | null> {
  const qs = new URLSearchParams({ inventory: input.inventory, bucket: "all", limit: "500" });
  if (input.primarySlug?.trim()) qs.set("primarySlug", input.primarySlug.trim());
  if (input.subSlug?.trim()) qs.set("subSlug", input.subSlug.trim());
  try {
    const res = await fetch(`/api/admin/delivery-ads?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; policyCounts?: PolicyCampaignCounts | null };
    return res.ok && json.ok && json.policyCounts ? json.policyCounts : null;
  } catch {
    return null;
  }
}

export async function fetchHeroPlacement(): Promise<PlacementInventoryModel["hero"] | null> {
  try {
    const res = await fetch("/api/admin/advertising/placement-inventory", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; inventory?: PlacementInventoryModel };
    return res.ok && json.ok && json.inventory ? json.inventory.hero : null;
  } catch {
    return null;
  }
}
