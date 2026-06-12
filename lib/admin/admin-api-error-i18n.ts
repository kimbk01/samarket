import type { MessageKey } from "@/lib/i18n/messages";

const KNOWN_CODES: Record<string, MessageKey> = {
  rpc_missing: "admin_store_points_rpc_missing",
  table_missing: "admin_points_charge_err_table_missing",
  point_charge_rpc_missing: "admin_points_charge_err_rpc_missing",
  not_found_or_already_processed: "admin_api_err_not_found_or_processed",
  already_processed: "admin_api_err_already_processed",
  approve_failed: "admin_api_err_approve_failed",
  not_found: "admin_api_err_not_found",
  missing_id: "common_error",
  missing_store_id: "common_error",
  forbidden: "admin_api_err_forbidden",
  supabase_unconfigured: "common_content_unavailable",
  invalid_json: "common_error",
  unauthorized: "common_login_required",
  insufficient_balance: "admin_api_err_insufficient_balance",
  store_not_found: "admin_api_err_store_not_found",
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 관리자 API `error` 코드 → `t()` 메시지 (snake_case key 화면 노출 금지) */
export function resolveAdminApiErrorMessage(
  codeOrMessage: string | null | undefined,
  t: TranslateFn,
  fallbackKey: MessageKey = "common_error"
): string {
  const raw = (codeOrMessage ?? "").trim();
  if (!raw) return t(fallbackKey);
  const key = KNOWN_CODES[raw];
  if (key) return t(key);
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return t(fallbackKey);
  return raw;
}
