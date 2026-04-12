"use client";

import Link from "next/link";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";

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
  const tabs: { kind: JobListingKindTab; label: string }[] = [
    { kind: "hire", label: "사람 구해요" },
    { kind: "work", label: "일 찾고 있어요" },
  ];

  return (
    <div className="flex w-full min-w-0 gap-2 px-1">
      {tabs.map(({ kind, label }) => {
        const active = selectedKind === kind;
        return (
          <Link
            key={kind}
            href={hrefFor(category, topicKey, kind)}
            scroll={false}
            className={`min-w-0 flex-1 rounded-full px-3 py-2 text-center text-[13px] font-semibold transition ${
              active
                ? "bg-sam-ink text-white shadow-sm"
                : "bg-sam-surface-muted text-sam-muted hover:bg-sam-border-soft"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
