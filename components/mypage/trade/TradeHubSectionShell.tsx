"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_TYPO_BODY,
  COMMUNITY_TYPO_SECTION_TITLE,
  PHILIFE_FB_CARD_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

/** 거래 허브 본문 카드 — `/philife` 피드 카드(`PHILIFE_FB_CARD`)와 동일 톤 */
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
    <section className={`${PHILIFE_FB_CARD_CLASS} px-3 py-4 sm:px-4 sm:py-5 ${className}`}>
      <div className="mb-3 sm:mb-4">
        <h2 className={`${COMMUNITY_TYPO_SECTION_TITLE} text-sam-fg`}>{tt(title)}</h2>
        {description ? (
          <p className={`mt-1 ${COMMUNITY_TYPO_BODY} leading-relaxed text-sam-muted`}>{tt(description)}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
