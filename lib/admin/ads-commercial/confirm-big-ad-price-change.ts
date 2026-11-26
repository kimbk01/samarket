"use client";

/**
 * 광고 가격 저장 — 3배 이상 바뀌면 한 번 더 확인 (광고 감사 D-13 · 2026-11-27).
 * 어드민 가격 화면 3곳(상위노출 · 회원 배너 · 매장 광고)이 같이 쓴다. 바뀐 줄이 없으면 바로 통과.
 */
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import type { MessageKey } from "@/lib/i18n/messages";

export async function confirmBigAdPriceChange(input: {
  ko: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** 3배 이상 바뀌는 줄만 (「거래 배너 7일: 1,500P → 15,000P ×10」) */
  bigLines: string[];
}): Promise<boolean> {
  if (input.bigLines.length === 0) return true;
  const r = await confirmAdminAction({
    level: adminActionLevel("pointPolicySave"),
    ko: input.ko,
    title: input.t("admin_ads_price_big_change_title"),
    description: input.t("admin_ads_price_big_change_desc", { lines: input.bigLines.join(" · ") }),
    confirmLabel: adminCta("save", input.ko),
  });
  return r.ok;
}
