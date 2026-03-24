/**
 * 13단계: 상품 상태 변경 이력 mock (Supabase 연동 시 교체)
 */

import type { ProductStatusLog, ProductStatus } from "@/lib/types/product";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_PRODUCT_STATUS_LOGS: ProductStatusLog[] = [];

export function addProductStatusLog(
  productId: string,
  fromStatus: ProductStatus,
  toStatus: ProductStatus,
  actionType: string,
  note: string = ""
): ProductStatusLog {
  const log: ProductStatusLog = {
    id: `psl-${Date.now()}`,
    productId,
    fromStatus,
    toStatus,
    actionType,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  MOCK_PRODUCT_STATUS_LOGS.push(log);
  return log;
}

export function getStatusLogsByProductId(productId: string): ProductStatusLog[] {
  return MOCK_PRODUCT_STATUS_LOGS.filter((l) => l.productId === productId);
}
