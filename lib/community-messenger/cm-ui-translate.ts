import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** lib·훅 등 React 밖에서 `community-messenger-ui` 문구 조회 */
export function translateCmUi(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(getRuntimeAppLanguage(), key, vars);
}
