"use client";

import type { ReactNode } from "react";
import {
  COMMUNITY_TYPO_BODY,
  COMMUNITY_TYPO_SECTION_TITLE,
  PHILIFE_FB_CARD_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

/**
 * 거래 허브 본문 카드 — 전역 카드/타이포 규격.
 * `flat`: 내정보 하위 화면(`/mypage/trade/*`) — MyScreen 평면 본문, 화면 전체를 카드로 감싸지 않는다 (M-06).
 */
export function TradeHubSectionShell({
  title,
  description,
  children,
  className = "",
  flat = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <section className={`${flat ? "py-3" : `${PHILIFE_FB_CARD_CLASS} sam-card-pad`} ${className}`}>
      <div className="mb-3">
        <h2 className={`${COMMUNITY_TYPO_SECTION_TITLE} text-sam-fg`}>{title}</h2>
        {description ? (
          <p className={`mt-1 ${COMMUNITY_TYPO_BODY} leading-relaxed text-sam-muted`}>{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
