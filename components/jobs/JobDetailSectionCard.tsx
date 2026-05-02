"use client";

import {
  TRADE_WRITE_FB_BLOCK_TITLE,
  TRADE_FB_DETAIL_META_ROW,
  TRADE_FB_DETAIL_META_DT,
  TRADE_FB_DETAIL_META_DD,
} from "@/lib/ui/trade-write-fb-ui";

export function JobDetailSectionCard({
  title,
  rows,
  className = "",
}: {
  title: string;
  rows: { label: string; value: string }[];
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`rounded-ui-rect border border-[#e4e6eb] bg-[#fafbfc] px-3 py-2.5 ${className}`.trim()}>
      <h3 className={`${TRADE_WRITE_FB_BLOCK_TITLE} mb-0`}>{title}</h3>
      <dl className="mt-1.5 space-y-1.5 text-[15px] leading-snug">
        {rows.map(({ label, value }) => (
          <div key={`${title}-${label}`} className={TRADE_FB_DETAIL_META_ROW}>
            <dt className={TRADE_FB_DETAIL_META_DT}>{label}</dt>
            <dd className={`${TRADE_FB_DETAIL_META_DD} font-semibold text-[#050505]`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
