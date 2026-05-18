import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translateText } from "@/lib/i18n/messages";

/** React 밖 메신저 UI — AppLanguageProvider 런타임 언어만 사용 (cookie/browser 금지) */
export function cmUi(text: string, vars?: Record<string, string | number>): string {
  return translateText(getRuntimeAppLanguage(), text, vars);
}
