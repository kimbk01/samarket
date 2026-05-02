"use client";

import Link from "next/link";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { Sam } from "@/lib/ui/sam-component-classes";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";

export type JobListTabValue = "all" | "hire" | "work";

function hrefForTab(
  category: CategoryWithSettings,
  topicKey: string | null,
  tab: JobListTabValue
): string {
  const base = `/market/${encodedTradeMarketSegment(category)}`;
  const params = new URLSearchParams();
  if (topicKey) params.set("topic", topicKey);
  if (tab === "hire") params.set("jk", "hire");
  if (tab === "work") params.set("jk", "work");
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function JobListTabs({
  category,
  topicKey,
  selectedTab,
}: {
  category: CategoryWithSettings;
  topicKey: string | null;
  selectedTab: JobListTabValue;
}) {
  const tabs: { tab: JobListTabValue; label: string }[] = [
    { tab: "all", label: "전체" },
    { tab: "hire", label: "사람 구해요" },
    { tab: "work", label: "일자리 찾고 있어요" },
  ];

  return (
    <HorizontalDragScroll
      className={`${Sam.tabs.barScroll} min-w-0 max-w-full py-0.5`}
      style={{ WebkitOverflowScrolling: "touch" }}
      role="tablist"
      aria-label="일자리 유형"
    >
      {tabs.map(({ tab, label }) => {
        const active = selectedTab === tab;
        return (
          <Link
            key={tab}
            href={hrefForTab(category, topicKey, tab)}
            scroll={false}
            role="tab"
            aria-selected={active}
            prefetch={false}
            className={`shrink-0 ${active ? Sam.tabs.tabActive : Sam.tabs.tab}`}
          >
            {label}
          </Link>
        );
      })}
    </HorizontalDragScroll>
  );
}
