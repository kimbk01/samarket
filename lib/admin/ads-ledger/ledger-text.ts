/**
 * 원장 문구 읽기 — 문구 원천은 카탈로그 `lib/i18n/catalog/ads-impl-1107-r1.ts` 하나 (구현 약속 규칙 2).
 * 순수 함수(서버·화면·시험 공용)라 `t()` 대신 카탈로그를 직접 읽는다. `{이름}` 치환은 `translate` 와 같다.
 */
import { adsImpl1107LedgerMessages } from "@/lib/i18n/catalog/ads-impl-1107-r1";

export type AdsLedgerTextKey = keyof typeof adsImpl1107LedgerMessages.ko;

export function ledgerText(key: AdsLedgerTextKey, ko: boolean, vars?: Record<string, string | number>): string {
  const table = ko ? adsImpl1107LedgerMessages.ko : adsImpl1107LedgerMessages.en;
  const template = String(table[key] ?? adsImpl1107LedgerMessages.ko[key] ?? "");
  if (!vars) return template;
  return Object.entries(vars).reduce<string>((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), template);
}
