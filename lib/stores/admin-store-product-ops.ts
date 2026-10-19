/**
 * Platform Admin — store_products ops (canonical table; not a shadow catalog).
 * Status/moderation actions + limited field corrections.
 */
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
          admin_review_memo: memo,
        },
      };
    case "hide":
      return {
        ok: true,
        patch: {
          product_status: "hidden",
          admin_review_memo: memo,
        },
      };
    case "activate":
      return {
        ok: true,
        patch: {
          product_status: "active",
          admin_review_status: "approved",
          admin_review_memo: memo,
        },
      };
    case "sold_out":
      return {
        ok: true,
        patch: {
          product_status: "sold_out",
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
          admin_review_memo: memo,
        },
      };
    case "archive":
      // Owner soft-remove uses hide/archive-hide semantics — not hard delete.
      return {
        ok: true,
        patch: {
          product_status: "hidden",
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
      return {
        ok: true,
        patch: {
          price: Math.round(price),
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
