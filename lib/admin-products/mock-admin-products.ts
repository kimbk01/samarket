/**
 * 13단계: 관리자 상품 목록/상세 (MOCK_PRODUCTS 기반)
 */

import type { Product } from "@/lib/types/product";
import { MOCK_PRODUCTS, getProductById, setProductStatus } from "@/lib/mock-products";
import { addProductStatusLog } from "./mock-product-status-logs";
import type { ProductStatus } from "@/lib/types/product";

const ADMIN_MEMO: Record<string, string> = {};
const REPORT_COUNT_CACHE: Record<string, number> = {};

/** 관리자용 상품 목록 (전체 상태 포함) */
export function getProductsForAdmin(): Product[] {
  return MOCK_PRODUCTS.map((p) => enrichForAdmin(p));
}

function enrichForAdmin(p: Product): Product {
  const reportCount = REPORT_COUNT_CACHE[p.id] ?? 0;
  const adminMemo = ADMIN_MEMO[p.id];
  return {
    ...p,
    reportCount: reportCount > 0 ? reportCount : undefined,
    adminMemo: adminMemo || undefined,
  };
}

export function getProductForAdminById(id: string): Product | undefined {
  const p = getProductById(id);
  return p ? enrichForAdmin(p) : undefined;
}

export function getAdminMemo(productId: string): string {
  return ADMIN_MEMO[productId] ?? "";
}

export function setAdminMemo(productId: string, memo: string): void {
  if (memo.trim()) ADMIN_MEMO[productId] = memo.trim();
  else delete ADMIN_MEMO[productId];
}

/** 신고 수 반영 (12단계 신고 처리와 연동용 placeholder) */
export function setReportCount(productId: string, count: number): void {
  REPORT_COUNT_CACHE[productId] = count;
}

/** 상태 변경 + 이력 기록 */
export function setProductStatusWithLog(
  productId: string,
  toStatus: ProductStatus,
  actionType: string,
  note: string = ""
): boolean {
  const p = getProductById(productId);
  if (!p) return false;
  const fromStatus = p.status;
  const ok = setProductStatus(productId, toStatus);
  if (ok) {
    addProductStatusLog(productId, fromStatus, toStatus, actionType, note);
  }
  return ok;
}

/** 끌올 시각 갱신 placeholder */
export function bumpProduct(productId: string): boolean {
  const p = getProductById(productId);
  if (!p) return false;
  (p as Product).bumpedAt = new Date().toISOString();
  return true;
}
