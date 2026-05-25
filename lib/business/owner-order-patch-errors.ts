import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const PATCH_ERR_KEYS: Record<string, MessageKey> = {
  prep_minutes_required: "store_biz_patch_err_prep_minutes",
  invalid_transition: "store_biz_patch_err_invalid_transition",
  order_admin_locked: "store_biz_patch_err_admin_locked",
};

export function formatOwnerOrderPatchErr(code: string, lang: AppLanguageCode): string {
  const key = PATCH_ERR_KEYS[code];
  return key ? translate(lang, key) : code;
}
