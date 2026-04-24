"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_TYPO_BODY,
  COMMUNITY_TYPO_SECTION_TITLE,
  PHILIFE_FB_CARD_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

/** 거래 허브 본문 카드 — 전역 카드/타이포 규격 */
export function TradeHubSectionShell({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const { tt } = useI18n();

  return (
    <section className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad ${className}`}>
      <div className="mb-3">
        <h2 className={`${COMMUNITY_TYPO_SECTION_TITLE} text-sam-fg`}>{tt(title)}</h2>
        {description ? (
          <p className={`mt-1 ${COMMUNITY_TYPO_BODY} leading-relaxed text-sam-muted`}>{tt(description)}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
