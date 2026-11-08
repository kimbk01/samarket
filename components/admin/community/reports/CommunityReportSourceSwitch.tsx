"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";

/** 신고 처리함 ↔ 모임 신고 (같은 틀, 다른 신고 원장) — 링크 탭 */
export function CommunityReportSourceSwitch({ current }: { current: "feed" | "meeting" }) {
  const { t } = useI18n();
  const item = (key: "feed" | "meeting", href: string, label: string) => {
    const on = current === key;
    return on ? (
      <span
        aria-current="page"
        className="rounded-full border border-sam-ink bg-sam-ink px-3 py-1 text-[12px] font-semibold text-white"
      >
        {label}
      </span>
    ) : (
      <Link
        href={href}
        className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-[12px] font-semibold text-sam-muted hover:text-sam-fg"
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label={t("admin_community_rsource_nav_label")} className="flex flex-wrap gap-1.5" data-community-report-source={current}>
      {item("feed", "/admin/community/reports", t("admin_community_rsource_feed_tab"))}
      {item("meeting", "/admin/philife/meeting-reports", t("admin_community_rsource_meeting_tab"))}
    </nav>
  );
}
