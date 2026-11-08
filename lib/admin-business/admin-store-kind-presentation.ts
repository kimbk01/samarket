/**
 * 5-A AB-01·AB-02 — 관리자 매장 유형·노출 배지 (순수 · 클라이언트 안전).
 * 「매장 운영」 표·카드가 같은 문구·톤을 쓴다.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type AdminStoreBadgeTone = "neutral" | "success" | "warning" | "danger" | "progress";

export function adminStoreKindBadge(
  kind: string | null | undefined,
  ko: boolean
): { tone: AdminStoreBadgeTone; label: string } | null {
  if (kind === "sample") return { tone: "warning", label: tx(ko, "admin_business_sample") };
  if (kind === "legacy_test") return { tone: "danger", label: tx(ko, "admin_business_test") };
  if (kind === "real") return { tone: "neutral", label: tx(ko, "admin_business_real") };
  return null;
}

export function adminStoreVisibilityBadge(
  visible: boolean,
  ko: boolean
): { tone: AdminStoreBadgeTone; label: string } {
  return visible
    ? { tone: "success", label: tx(ko, "admin_business_visible") }
    : { tone: "neutral", label: tx(ko, "common_hidden") };
}
