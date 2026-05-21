import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import type { MessageKey } from "@/lib/i18n/messages";

/** `resolve-main-tier1` 의 `titleText`·`ariaLabel` 등 — 카탈로그 키는 `t`, 한글 리터럴은 `tt` */
export function resolveTier1BarLabel(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  tt: (text: string, vars?: Record<string, string | number>) => string,
  value: string | undefined
): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (looksLikeMessageKey(raw)) return t(raw as MessageKey);
  return tt(raw);
}
