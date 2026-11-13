"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

/**
 * Marketplace HOME entry chrome — location, in-page search, sell hub.
 * Search stays on `/market?q=` (CUT C). Sell hub → WRITE / my listings / sales / mypage.
 * DO NOT: new routes, CUT C backend, LIST ranking.
 *
 * 안에 보이는 내용이 없는 칸(화면 읽기용 안내만) — 위아래 여백을 두지 않는다. 여백 10px 이 거래 머리글에만 빈 띠를 만들어
 * 「정보교환 · 거래」 전환 줄이 커뮤니티보다 9px 아래에 그려졌다 (Owner 「3건 수정」 2026-11-12).
 */
export function MarketplaceHomeEntryChrome() {
  const { t } = useI18n();

  return (
    <div className="min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]">
      <div className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`}>
        <p className="sr-only">{t("marketplace_search_entry_aria")}</p>
      </div>
    </div>
  );
}
