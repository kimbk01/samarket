import type { MessageKey } from "@/lib/i18n/messages";

export const BOTTOM_NAV_BUILTIN_ICON_KEYS = ["orders", "cart", "home", "user"] as const;

export const ADMIN_DEL_API_ERROR_KEYS: Record<string, MessageKey> = {
  load_failed: "admin_del_err_load_failed",
  create_failed: "admin_del_err_create_failed",
  save_failed: "admin_del_err_save_failed",
};

export function resolveAdminDelApiError(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  code: string | undefined | null
): string {
  if (!code) return t("common_error");
  const key = ADMIN_DEL_API_ERROR_KEYS[code];
  return key ? t(key) : code;
}
