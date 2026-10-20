/**
 * Platform Admin — store_products ops (canonical table; not a shadow catalog).
 * Status/moderation actions + limited field corrections.
 *
 * ND-1 (Owner 결정): 관리자 숨김·품절·차단은 `admin_status_lock` 으로 잠가 오너가 되돌리지 못한다.
 * 해제는 관리자 「판매 재개(activate)」만. 품절 사유(PRD-06)는 관리자 품절 = `admin`.
 * PRD-04: 가격 정정은 현재 할인율로 할인가를 재계산한다 (할인율 없고 할인가 >= 새 가격이면 할인 해제).
 */
import { reconcileDiscountForNewPrice } from "@/lib/stores/store-product-discount-reconcile";

export const ADMIN_STORE_PRODUCT_ACTIONS = [
  "block",
  "hide",
  "activate",
  "sold_out",
  "approve_review",
  "reject_review",
  "correct_name",
  "correct_price",
  "archive",
] as const;

export type AdminStoreProductAction = (typeof ADMIN_STORE_PRODUCT_ACTIONS)[number];

export function isAdminStoreProductAction(action: string): action is AdminStoreProductAction {
  return (ADMIN_STORE_PRODUCT_ACTIONS as readonly string[]).includes(action);
}

/** L2 조치 (사유 필수 → admin_review_memo): 차단 · 숨김 · 검수 반려 · 보관(=숨김). DEF-37 서버 검증. */
export const ADMIN_STORE_PRODUCT_ACTIONS_REQUIRING_MEMO = new Set<AdminStoreProductAction>([
  "block",
  "hide",
  "reject_review",
  "archive",
]);

export function adminStoreProductMemoMissing(action: AdminStoreProductAction, memo: string | null): boolean {
  return ADMIN_STORE_PRODUCT_ACTIONS_REQUIRING_MEMO.has(action) && (memo ?? "").trim().length < 2;
}

export type AdminStoreProductActionInput = {
  action: AdminStoreProductAction;
  memo: string | null;
  name?: string | null;
  price?: number | null;
  /** correct_price — 현재 행의 할인 필드 (할인가 재계산 기준) */
  current?: { discount_price?: unknown; discount_percent?: unknown } | null;
};

export function buildAdminStoreProductPatch(
  input: AdminStoreProductActionInput
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const built = buildAdminStoreProductPatchRaw(input);
  if (!built.ok) return built;
  // 값이 없는 필드는 보내지 않는다 (기존 검수 메모 보존).
  const patch = Object.fromEntries(Object.entries(built.patch).filter(([, v]) => v !== undefined));
  return { ok: true, patch };
}

function buildAdminStoreProductPatchRaw(
  input: AdminStoreProductActionInput
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  // 메모가 없는 조치(승인·품절·상품명/가격 수정 등)는 기존 검수 메모를 지우지 않는다.
  const memoText = (input.memo ?? "").trim();
  const memo = memoText.length > 0 ? memoText : undefined;
  switch (input.action) {
    case "block":
      return {
        ok: true,
        patch: {
          product_status: "blocked",
          admin_review_status: "rejected",
          admin_status_lock: "blocked",
          sold_out_reason: null,
          admin_review_memo: memo,
        },
      };
    case "hide":
      return {
        ok: true,
        patch: {
          product_status: "hidden",
          admin_status_lock: "hidden",
          sold_out_reason: null,
          admin_review_memo: memo,
        },
      };
    case "activate":
      return {
        ok: true,
        patch: {
          product_status: "active",
          admin_review_status: "approved",
          // ND-1: 관리자 잠금 해제는 이 조치로만.
          admin_status_lock: null,
          sold_out_reason: null,
          admin_review_memo: memo,
        },
      };
    case "sold_out":
      return {
        ok: true,
        patch: {
          product_status: "sold_out",
          admin_status_lock: "sold_out",
          sold_out_reason: "admin",
          admin_review_memo: memo,
        },
      };
    case "approve_review":
      return {
        ok: true,
        patch: {
          admin_review_status: "approved",
          admin_review_memo: memo,
        },
      };
    case "reject_review":
      // 검수 반려 = 고객 메뉴 비노출 + 사장님에게 사유 표시 (DEF-65, Owner 승인).
      return {
        ok: true,
        patch: {
          product_status: "hidden",
          admin_review_status: "rejected",
          sold_out_reason: null,
          admin_review_memo: memo,
        },
      };
    case "archive":
      // Owner soft-remove uses hide/archive-hide semantics — not hard delete.
      return {
        ok: true,
        patch: {
          product_status: "hidden",
          admin_status_lock: "hidden",
          sold_out_reason: null,
          admin_review_memo: memo,
        },
      };
    case "correct_name": {
      const title = String(input.name ?? "").trim();
      if (title.length < 1 || title.length > 120) {
        return { ok: false, error: "invalid_name" };
      }
      return {
        ok: true,
        patch: {
          title,
          admin_review_memo: memo,
        },
      };
    }
    case "correct_price": {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) {
        return { ok: false, error: "invalid_price" };
      }
      const nextPrice = Math.round(price);
      const discount = reconcileDiscountForNewPrice(nextPrice, input.current ?? {});
      return {
        ok: true,
        patch: {
          price: nextPrice,
          discount_price: discount.discount_price,
          discount_percent: discount.discount_percent,
          admin_review_memo: memo,
        },
      };
    }
    default: {
      const _exhaustive: never = input.action;
      return { ok: false, error: String(_exhaustive) };
    }
  }
}
