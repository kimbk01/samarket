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

export type AdminStoreProductActionInput = {
  action: AdminStoreProductAction;
  memo: string | null;
  name?: string | null;
  price?: number | null;
};

export function buildAdminStoreProductPatch(
  input: AdminStoreProductActionInput
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const memo = input.memo;
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
      return {
        ok: true,
        patch: {
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
