"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 거래 목록 계약 §4 (C) — 순서 구간이 바뀌는 곳의 안내 줄.
 * `list_section` 키(예: "cat:other|loc:nearby")의 조각을 문구로 바꿔 「 · 」로 잇는다.
 */
const PART_KEYS: Record<string, MessageKey> = {
  "cat:similar": "trade_list_section_cat_similar",
  "cat:other": "trade_list_section_cat_other",
  "opt:mismatch": "trade_list_section_opt_mismatch",
  "price:out": "trade_list_section_price_out",
  "state:sold": "trade_list_section_state_sold",
  "state:active": "trade_list_section_state_active",
  "loc:city": "trade_list_section_loc_city",
  "loc:nearby": "trade_list_section_loc_nearby",
  "loc:outside": "trade_list_section_loc_outside",
};

export function tradeListSectionLabel(
  section: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  query: string
): string {
  const parts = section.split("|").filter(Boolean);
  const labels: string[] = [];
  for (const part of parts) {
    if (part === "q:rest") {
      labels.push(t("trade_list_section_q_rest", { q: query }));
      continue;
    }
    const key = PART_KEYS[part];
    if (key) labels.push(t(key));
  }
  return labels.join(" · ");
}

/** 앞 글과 구간이 다르면 true — 첫 글은 「일치 없음」(q:rest 시작)일 때만 안내 */
export function shouldShowTradeListSectionDivider(
  prevSection: string | undefined,
  section: string | undefined,
  index: number
): boolean {
  if (section == null) return false;
  if (index === 0) return section.startsWith("q:rest");
  return prevSection != null && prevSection !== section;
}

export function TradeListSectionDivider({ section, query }: { section: string; query: string }) {
  const { t } = useI18n();
  const isNoMatchTop = section.startsWith("q:rest");
  const label = tradeListSectionLabel(section, t, query);
  if (!label) return null;
  return (
    <li className="col-span-full min-w-0" data-trade-list-section={section} role="separator">
      <div className="flex items-center gap-2 py-1">
        <span className="h-px flex-1 bg-sam-border" aria-hidden />
        <span className="shrink-0 text-[12px] font-medium text-sam-muted">
          {isNoMatchTop ? `${t("trade_list_search_no_match", { q: query })} · ${label}` : label}
        </span>
        <span className="h-px flex-1 bg-sam-border" aria-hidden />
      </div>
    </li>
  );
}
