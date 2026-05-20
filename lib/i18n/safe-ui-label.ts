import type { AppLanguageCode } from "./config";
import { translate, type MessageKey } from "./messages";

/** 화면에 그대로 노출되면 안 되는 i18n 토큰 형태 (예: store_browse_food_all, nav_bottom_trade) */
const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

export function looksLikeMessageKey(text: string): boolean {
  const s = text.trim();
  return s.length >= 6 && MESSAGE_KEY_PATTERN.test(s);
}

export function humanizeMessageKeySlug(keyOrSlug: string): string {
  const raw = keyOrSlug.trim().replace(/^[a-z]+_/, "");
  const parts = raw.split(/[_-]+/).filter(Boolean);
  if (!parts.length) return "Label";
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

/** 관리자·taxonomy 자유 텍스트 — key 문자열이 들어온 경우 차단 */
export function sanitizeUiDisplayLabel(candidate: string, fallbackLabel: string): string {
  const s = candidate.trim();
  if (!s) return fallbackLabel;
  if (looksLikeMessageKey(s)) return fallbackLabel;
  return s;
}

/** 카탈로그 `t(key)` — 비었거나 key·토큰이면 ko → 짧은 humanize */
export function resolveSafeMessageKey(
  lang: AppLanguageCode,
  key: MessageKey,
  fallbackLabel?: string
): string {
  const fb = (fallbackLabel ?? humanizeMessageKeySlug(key)).trim() || "…";
  const raw = translate(lang, key).trim();
  if (!raw || raw === key || looksLikeMessageKey(raw)) {
    const ko = translate("ko", key).trim();
    if (ko && ko !== key && !looksLikeMessageKey(ko)) return ko;
    return fb;
  }
  return raw;
}

export function safeMessageT(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  lang: AppLanguageCode,
  key: MessageKey,
  fallbackLabel?: string
): string {
  return resolveSafeMessageKey(lang, key, fallbackLabel ?? sanitizeUiDisplayLabel(t(key), humanizeMessageKeySlug(key)));
}
