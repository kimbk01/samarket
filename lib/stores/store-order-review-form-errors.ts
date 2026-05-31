/** Store order review form — API error code → i18n key (UI는 t()만 출력). */
export type StoreOrderReviewSubmitErrorKey =
  | "mypage_comp_store_review_err_not_completed"
  | "mypage_comp_store_review_err_exists"
  | "mypage_comp_store_review_save_failed_generic";

export function resolveStoreOrderReviewSubmitErrorKey(code: string): StoreOrderReviewSubmitErrorKey {
  if (code === "order_not_completed") return "mypage_comp_store_review_err_not_completed";
  if (code === "review_already_exists") return "mypage_comp_store_review_err_exists";
  return "mypage_comp_store_review_save_failed_generic";
}

export const STORE_ORDER_REVIEW_VIEWPORT_SHELL_CLASS =
  "flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden";
