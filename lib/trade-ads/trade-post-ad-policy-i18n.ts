import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

function tradeAdT(lang: AppLanguageCode, key: MessageKey): string {
  return translate(lang, key);
}

const GUIDE_KEYS = [
  "trade_ad_guide_1",
  "trade_ad_guide_2",
  "trade_ad_guide_3",
  "trade_ad_guide_4",
] as const satisfies readonly MessageKey[];

export function tradePaidAdFormatGuide(lang: AppLanguageCode = DEFAULT_APP_LANGUAGE): string[] {
  return GUIDE_KEYS.map((key) => tradeAdT(lang, key));
}

export function tradeAdCheckLabel(
  lang: AppLanguageCode,
  checkKey: string
): string {
  return tradeAdT(lang, `trade_ad_chk_${checkKey}_label` as MessageKey);
}

export function tradeAdCheckDetail(
  lang: AppLanguageCode,
  checkKey: string,
  pass: boolean
): string {
  const suffix = pass ? "ok" : "fail";
  return tradeAdT(lang, `trade_ad_chk_${checkKey}_${suffix}` as MessageKey);
}
