/**
 * 28단계: 노출 후보 목록 mock (MOCK_PRODUCTS + 광고/포인트/상점 연동)
 */

import type { ExposureCandidate } from "@/lib/types/exposure";
import type { Product } from "@/lib/types/product";
import { MOCK_PRODUCTS, getProductsForHome } from "@/lib/mock-products";
import { getMemberType } from "@/lib/admin-users/mock-admin-users";
import { getPromotedItems } from "@/lib/ads/mock-promoted-items";
import { getPointPromotionOrders } from "@/lib/points/mock-point-promotion-orders";
import { getBusinessProfilesForAdmin } from "@/lib/business/mock-business-profiles";
import { getBusinessProducts } from "@/lib/business/mock-business-products";

const excludeStatus = ["hidden", "blinded", "deleted"] as const;

function parseLocation(location: string): { region: string; city: string; barangay: string } {
  const parts = (location ?? "").split("·").map((s) => s.trim());
  const region = parts[0] ?? "";
  const city = parts[1] ?? "";
  const barangay = parts[2] ?? "";
  return { region, city, barangay };
}

function getBusinessProfileIdByProductId(productId: string): string | null {
  const profiles = getBusinessProfilesForAdmin();
  for (const profile of profiles) {
    const products = getBusinessProducts(profile.id);
    if (products.some((p) => p.id === productId)) return profile.id;
  }
  return null;
}

function getAdStatusForProduct(productId: string): ExposureCandidate["adPromotionStatus"] {
  const items = getPromotedItems().filter(
    (pi) => pi.targetType === "product" && pi.targetId === productId
  );
  if (items.length === 0) return "none";
  const now = new Date().toISOString();
  const active = items.find((i) => i.status === "active" && i.startAt <= now && i.endAt >= now);
  if (active) return "active";
  const scheduled = items.find((i) => i.startAt > now);
  if (scheduled) return "scheduled";
  return "expired";
}

function getPointPromotionStatusForProduct(productId: string): ExposureCandidate["pointPromotionStatus"] {
  const orders = getPointPromotionOrders().filter(
    (o) => o.targetId === productId
  );
  if (orders.length === 0) return "none";
  const now = new Date().toISOString();
  const active = orders.find((o) => o.orderStatus === "active" && o.startAt <= now && o.endAt >= now);
  if (active) return "active";
  const scheduled = orders.find((o) => o.startAt > now);
  if (scheduled) return "scheduled";
  return "expired";
}

function productToCandidate(p: Product): ExposureCandidate {
  const sellerId = p.sellerId ?? p.seller?.id ?? "";
  const sellerNickname = p.seller?.nickname ?? "";
  const { region, city, barangay } = parseLocation(p.location ?? "");
  const businessProfileId = getBusinessProfileIdByProductId(p.id);

  return {
    id: p.id,
    title: p.title,
    sellerId,
    sellerNickname,
    memberType: getMemberType(sellerId),
    businessProfileId,
    isBusinessItem: !!businessProfileId,
    price: p.price,
    status: p.status,
    likesCount: p.likesCount ?? 0,
    chatCount: p.chatCount ?? 0,
    viewCount: p.viewCount ?? 0,
    createdAt: p.createdAt,
    bumpedAt: p.bumpedAt ?? null,
    region,
    city,
    barangay,
    distance: p.distance ?? 999,
    adPromotionStatus: getAdStatusForProduct(p.id),
    pointPromotionStatus: getPointPromotionStatusForProduct(p.id),
    shopFeaturedStatus: businessProfileId ? "active" : "none",
  };
}

/** 홈/검색용 후보 (hidden·blinded·deleted 제외) */
export function getExposureCandidatesForHome(regionName?: string): ExposureCandidate[] {
  const products = getProductsForHome(regionName);
  return products.map(productToCandidate);
}

/** 전체 상품 기준 후보 (관리자 시뮬레이션용) */
export function getExposureCandidatesAll(): ExposureCandidate[] {
  const list = MOCK_PRODUCTS.filter(
    (p) => !excludeStatus.includes(p.status as (typeof excludeStatus)[number])
  );
  return list.map(productToCandidate);
}

/** 상품 배열 → 노출 후보 배열 (홈/검색 정렬 연동용) */
export function getCandidatesFromProducts(products: Product[]): ExposureCandidate[] {
  return products.map(productToCandidate);
}

export function getExposureCandidateById(id: string): ExposureCandidate | undefined {
  const p = MOCK_PRODUCTS.find((x) => x.id === id);
  if (!p || excludeStatus.includes(p.status as (typeof excludeStatus)[number]))
    return undefined;
  return productToCandidate(p);
}
