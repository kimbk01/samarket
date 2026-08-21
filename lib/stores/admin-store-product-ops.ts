/**
 * Platform Admin — limited store_products ops (not Owner CRUD).
 * Writes only `product_status` / `admin_review_*` on store_products.
 */
export const ADMIN_STORE_PRODUCT_ACTIONS = [
  "block",
  "hide",
  "activate",
  "sold_out",
  "approve_review",
  "reject_review",
] as const;

export type AdminStoreProductAction = (typeof ADMIN_STORE_PRODUCT_ACTIONS)[number];

export function isAdminStoreProductAction(action: string): action is AdminStoreProductAction {
  return (ADMIN_STORE_PRODUCT_ACTIONS as readonly string[]).includes(action);
}

export function buildAdminStoreProductPatch(
  action: AdminStoreProductAction,
  memo: string | null
): Record<string, unknown> {
  switch (action) {
    case "block":
      return {
        product_status: "blocked",
        admin_review_status: "rejected",
        admin_review_memo: memo,
      };
    case "hide":
      return {
        product_status: "hidden",
        admin_review_memo: memo,
      };
    case "activate":
      return {
        product_status: "active",
        admin_review_status: "approved",
        admin_review_memo: memo,
      };
    case "sold_out":
      return {
        product_status: "sold_out",
        admin_review_memo: memo,
      };
    case "approve_review":
      return {
        admin_review_status: "approved",
        admin_review_memo: memo,
      };
    case "reject_review":
      return {
        admin_review_status: "rejected",
        admin_review_memo: memo,
      };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
