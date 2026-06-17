"use client";

import { CM_FEED_CARD_CLASS } from "@/lib/community/community-ui-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function SkeletonRow() {
  return (
    <div className={`flex gap-3 px-4 py-4 ${CM_FEED_CARD_CLASS}`}>
      <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-2xl bg-[var(--cm-primary-soft)]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <div className="h-3 w-20 animate-pulse rounded-full bg-[var(--cm-primary-soft)]" />
        <div className="h-4 w-[88%] max-w-md animate-pulse rounded-full bg-[var(--cm-primary-soft)]" />
        <div className="h-4 w-[72%] max-w-sm animate-pulse rounded-full bg-[var(--cm-primary-soft)]" />
        <div className="flex gap-2 pt-1">
          <div className="h-3 w-12 animate-pulse rounded-full bg-[var(--cm-primary-soft)]" />
          <div className="h-3 w-12 animate-pulse rounded-full bg-[var(--cm-primary-soft)]" />
        </div>
      </div>
    </div>
  );
}

/** 첫 페인트·캐시 미스 시 — 텍스트 한 줄 대신 카드 골격으로 가벼운 인상 */
export function CommunityFeedSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4 px-4 pt-3 pb-3" aria-busy aria-label={t("community_feed_loading_aria")}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
