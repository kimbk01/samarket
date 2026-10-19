"use client";

import Link from "next/link";

/** 신고 처리함 ↔ 모임 신고 (같은 틀, 다른 신고 원장) — 링크 탭 */
export function CommunityReportSourceSwitch({ current }: { current: "feed" | "meeting" }) {
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
    <nav aria-label="신고 종류" className="flex flex-wrap gap-1.5" data-community-report-source={current}>
      {item("feed", "/admin/community/reports", "게시글·댓글·회원 신고")}
      {item("meeting", "/admin/philife/meeting-reports", "모임 신고")}
    </nav>
  );
}
