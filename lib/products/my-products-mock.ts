/**
 * 5단계: 내상품 목록·상태 변경 mock (Supabase 전환 시 교체)
 */

import type { Product } from "@/lib/types/product";
import type { ProductStatus } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import type { StatusChangeRecord } from "@/lib/products/status-utils";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { MOCK_PRODUCTS, CURRENT_USER_ID } from "@/lib/mock-products";

function getSellerId(p: Product): string | undefined {
  return p.sellerId ?? p.seller?.id;
}

/** 내 상품만 필터 + 상태 필터 (전체: active·reserved·sold만, 숨김은 '숨김' 탭에서) */
export function getMyProducts(
  userId: string,
  filter: MyProductFilterKey = "all"
): Product[] {
  const mine = MOCK_PRODUCTS.filter((p) => getSellerId(p) === userId);
  if (filter === "all") {
    return mine.filter((p) => p.status !== "hidden");
  }
  return mine.filter((p) => p.status === filter);
}

/** 상태 변경 이력 mock (UI 노출 optional) */
export const MOCK_STATUS_HISTORY: StatusChangeRecord[] = [];

function addStatusHistory(
  productId: string,
  fromStatus: ProductStatus,
  toStatus: ProductStatus,
  actionType: StatusChangeRecord["actionType"]
): void {
  MOCK_STATUS_HISTORY.push({
    productId,
    fromStatus,
    toStatus,
    changedAt: new Date().toISOString(),
    actionType,
  });
}

/** 상태 변경 (local 즉시 반영) */
export function updateProductStatus(
  productId: string,
  toStatus: ProductStatus
): boolean {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  if (!product) return false;
  const fromStatus = product.status;
  product.status = toStatus;
  product.updatedAt = new Date().toISOString();
  if (toStatus === "sold") {
    product.sellerListingState = "completed";
  } else if (toStatus === "reserved") {
    product.sellerListingState = "reserved";
  } else if (toStatus === "active") {
    product.sellerListingState = "inquiry";
  }
  /* hidden: sellerListingState 유지 */
  const actionType =
    toStatus === "reserved"
      ? "reserve"
      : toStatus === "sold"
        ? "sold"
        : toStatus === "active"
          ? "active"
          : toStatus === "hidden"
            ? "hide"
            : "edit";
  addStatusHistory(productId, fromStatus, toStatus, actionType);
  return true;
}

/** 판매 진행 단계 (채팅·내상품과 동일 규칙) — mock 목록용 */
export function updateProductSellerListingState(
  productId: string,
  state: SellerListingState
): boolean {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  if (!product) return false;
  const fromStatus = product.status;
  product.sellerListingState = state;
  product.status =
    state === "completed"
      ? "sold"
      : state === "reserved"
        ? "reserved"
        : "active";
  product.updatedAt = new Date().toISOString();
  addStatusHistory(productId, fromStatus, product.status, "edit");
  return true;
}

/** 끌올: updatedAt·isBoosted 갱신 */
export function bumpProduct(productId: string): boolean {
  const product = MOCK_PRODUCTS.find((p) => p.id === productId);
  if (!product) return false;
  const fromStatus = product.status;
  product.updatedAt = new Date().toISOString();
  product.isBoosted = true;
  addStatusHistory(productId, fromStatus, fromStatus, "bump");
  return true;
}

/** 삭제 (목록에서 제거) */
export function deleteProduct(productId: string): boolean {
  const idx = MOCK_PRODUCTS.findIndex((p) => p.id === productId);
  if (idx === -1) return false;
  const product = MOCK_PRODUCTS[idx];
  addStatusHistory(productId, product.status, product.status, "delete");
  MOCK_PRODUCTS.splice(idx, 1);
  return true;
}

export { CURRENT_USER_ID };
