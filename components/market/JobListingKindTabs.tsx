"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { Sam } from "@/lib/ui/sam-component-classes";

export type JobListingKindTab = "hire" | "work";

function hrefFor(
  category: CategoryWithSettings,
  topicKey: string | null,
  kind: JobListingKindTab
): string {
  const base = `/market/${encodedTradeMarketSegment(category)}`;
  const params = new URLSearchParams();
  if (topicKey) params.set("topic", topicKey);
  params.set("jk", kind);
  const q = params.toString();
  return q ? `${base}?${q}` : `${base}?jk=${kind}`;
}

export function JobListingKindTabs({
  category,
  selectedKind,
  topicKey,
}: {
  category: CategoryWithSettings;
  selectedKind: JobListingKindTab;
  /** 현재 주제 칩 선택값(topic 쿼리) — 유지 */
  topicKey: string | null;
}) {
  const { t } = useI18n();
  const tabs: { kind: JobListingKindTab; labelKey: "jobs_listing_hire" | "jobs_listing_work_short" }[] = [
    { kind: "hire", labelKey: "jobs_listing_hire" },
    { kind: "work", labelKey: "jobs_listing_work_short" },
  ];

  return (
    <div className={`${Sam.tabs.bar} min-w-0 max-w-full`} role="tablist" aria-label={t("ui_market_jobs_tab_aria")}>
      {tabs.map(({ kind, labelKey }) => {
        const active = selectedKind === kind;
        return (
          <Link
            key={kind}
            href={hrefFor(category, topicKey, kind)}
            scroll={false}
            role="tab"
            aria-selected={active}
            prefetch={false}
            className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
