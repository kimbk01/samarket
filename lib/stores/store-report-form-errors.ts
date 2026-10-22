/** CRT-10 — 매장·메뉴 신고 API(`/api/me/store-reports`) 오류 코드 → i18n 키. UI 는 원래 코드를 보여 주지 않는다. */
export type StoreReportSubmitErrorKey =
  | "store_report_err_duplicate"
  | "store_report_err_invalid"
  | "store_report_err_store_not_found"
  | "store_report_err_product_not_found"
  | "store_report_err_product_not_reportable"
  | "store_report_err_rate_limited"
  | "store_report_err_failed";

const STORE_REPORT_ERROR_KEY: Record<string, StoreReportSubmitErrorKey> = {
  report_recent_duplicate: "store_report_err_duplicate",
  invalid_json: "store_report_err_invalid",
  missing_store_slug: "store_report_err_invalid",
  invalid_target_type: "store_report_err_invalid",
  invalid_reason_type: "store_report_err_invalid",
  invalid_message: "store_report_err_invalid",
  missing_product_id: "store_report_err_invalid",
  store_not_found: "store_report_err_store_not_found",
  store_not_public: "store_report_err_store_not_found",
  product_not_found: "store_report_err_product_not_found",
  product_store_mismatch: "store_report_err_product_not_reportable",
  product_not_active: "store_report_err_product_not_reportable",
  report_rate_limited: "store_report_err_rate_limited",
};

export function resolveStoreReportSubmitErrorKey(code: unknown): StoreReportSubmitErrorKey {
  return (typeof code === "string" && STORE_REPORT_ERROR_KEY[code]) || "store_report_err_failed";
}
