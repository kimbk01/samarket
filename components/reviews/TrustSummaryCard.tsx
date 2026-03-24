"use client";

import type { UserTrustSummary } from "@/lib/types/review";
import { getAppSettings } from "@/lib/app-settings";
import { mannerBatteryAccentClass, mannerBatteryTier, mannerRawToPercent } from "@/lib/trust/manner-battery";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";

interface TrustSummaryCardProps {
  summary: UserTrustSummary;
  /** compact: 판매자 카드용, full: 마이페이지용 */
  variant?: "compact" | "full";
}

export function TrustSummaryCard({ summary, variant = "full" }: TrustSummaryCardProps) {
  const raw = summary.mannerScore;
  const percent = mannerRawToPercent(raw);
  const tier = mannerBatteryTier(percent);
  const accent = mannerBatteryAccentClass(tier);
  const batteryLabel = getAppSettings().speedDisplayLabel ?? "배터리";

  if (summary.reviewCount === 0 && variant === "compact") {
    return (
      <span className="flex items-center justify-end gap-1.5 text-[12px] text-gray-500">
        <MannerBatteryIcon tier={tier} percent={percent} size="sm" />
        <span className={`font-semibold tabular-nums ${accent}`}>{percent}%</span>
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <MannerBatteryIcon tier={tier} percent={percent} size="sm" />
          <p className={`text-[12px] font-semibold tabular-nums ${accent}`}>{percent}%</p>
        </div>
        <p className="text-[11px] text-gray-500">후기 {summary.reviewCount}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-gray-700">{batteryLabel}</span>
        <div className="flex items-center gap-2">
          <MannerBatteryIcon tier={tier} percent={percent} size="md" />
          <span className={`text-[18px] font-semibold tabular-nums ${accent}`}>{percent}%</span>
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-[12px] text-gray-500">
        <span>후기 {summary.reviewCount}개</span>
        {summary.reviewCount > 0 && (
          <>
            <span>평균 {summary.averageRating}점</span>
            <span>좋아요 {summary.positiveCount}</span>
          </>
        )}
      </div>
      {summary.summaryTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {summary.summaryTags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
