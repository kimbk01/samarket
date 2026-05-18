import { normalizeAppLanguage } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const TRADE_SKIN_PREVIEW_KEYS: Record<string, MessageKey> = {
  general: "cat_skin_general",
  "used-car": "cat_skin_used_car",
  "real-estate": "cat_skin_real_estate",
  jobs: "cat_skin_jobs",
  exchange: "cat_skin_exchange",
};

export function postPreviewT(
  locale: string,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return translate(normalizeAppLanguage(locale), key, vars);
}

export function postPreviewSkinLabel(locale: string, skinKey: string): string {
  const key = TRADE_SKIN_PREVIEW_KEYS[skinKey];
  return key ? postPreviewT(locale, key) : skinKey;
}
