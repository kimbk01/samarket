import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

export function offerServerT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}
