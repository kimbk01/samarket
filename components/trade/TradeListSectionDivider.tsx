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
  const parts = section.split("|").filter((part) => part && !part.startsWith("loc:"));
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

/**
 * 앞 글과 구간이 다르면 true. 첫 글도 고른 조건의 첫 구간이 아니면(키가 비어 있지 않으면) 맨 위에 안내한다
 * — 예: 「환전」을 골랐는데 환전 글이 없으면 맨 위부터 「다른 물품」 안내(필터가 안 먹은 것처럼 보이지 않게).
 */
/**
 * 안내 줄은 고른 조건과 다른 글이 시작되는 곳에만 — 지역 구간(동네·시·주변·그 외)은 순서만 정하고
 * 줄 없이 자연스럽게 이어진다(Owner 2026-10-27).
 */
export function shouldShowTradeListSectionDivider(
  prevSection: string | undefined,
  section: string | undefined,
  index: number
): boolean {
  if (section == null) return false;
  const key = sectionDisplayKey(section);
  if (index === 0) return key !== "";
  if (prevSection == null) return false;
  return key !== "" && sectionDisplayKey(prevSection) !== key;
}

/** 화면 문구 기준 키 — 지역 조각(loc:*)은 빼고 본다 */
function sectionDisplayKey(section: string): string {
  return section
    .split("|")
    .filter((part) => part && !part.startsWith("loc:"))
    .join("|");
}

export function TradeListSectionDivider({
  section,
  query,
  atTop = false,
}: {
  section: string;
  query: string;
  /** 목록 맨 위 안내(첫 글이 고른 조건 밖)인지 */
  atTop?: boolean;
}) {
  const { t } = useI18n();
  const isNoMatchTop = atTop && section.startsWith("q:rest");
  /** 맨 위 「일치 없음」이면 q:rest 문구는 빼고(같은 말 두 번 금지) 나머지 조건만 잇는다 */
  const label = isNoMatchTop
    ? tradeListSectionLabel(section.split("|").filter((p) => p !== "q:rest").join("|"), t, query)
    : tradeListSectionLabel(section, t, query);
  const noMatch = isNoMatchTop ? t("trade_list_search_no_match", { q: query }) : "";
  if (!label && !noMatch) return null;
  return (
    <li className="col-span-full min-w-0" data-trade-list-section={section} role="separator">
      <div className="flex items-center gap-2 py-1">
        <span className="h-px flex-1 bg-sam-border" aria-hidden />
        <span className="shrink-0 text-[12px] font-medium text-sam-muted">
          {noMatch ? (label ? `${noMatch} · ${label}` : noMatch) : label}
        </span>
        <span className="h-px flex-1 bg-sam-border" aria-hidden />
      </div>
    </li>
  );
}
