import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 관리자 API 응답 status·body → 사용자용 i18n 문장 */
export function resolveAdminHttpErrorMessage(
  res: Response,
  body: { error?: string; code?: string } | null | undefined,
  t: TranslateFn,
  fallbackKey: MessageKey = "common_error"
): string {
  if (res.status === 401) return t("common_login_required");
  if (res.status === 403) return t("admin_api_err_forbidden");
  const code = body?.code ?? body?.error;
  return resolveAdminApiErrorMessage(code, t, fallbackKey);
}
