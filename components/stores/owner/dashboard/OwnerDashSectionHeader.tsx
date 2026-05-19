"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ownerDashTypography } from "./owner-dashboard-ui";

/** 카드 상단 — 제목 + 「전체 보기」/「상세 보기」 */
export function OwnerDashSectionHeader({
  id,
  title,
  href,
  linkLabel = "전체 보기",
}: {
  id?: string;
  title: string;
  href: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id={id} className={ownerDashTypography.sectionTitle}>
        {title}
      </h2>
      <Link
        href={href}
        prefetch={false}
        className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-gray-500 hover:text-[#1C8DB8]"
      >
        {linkLabel}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
