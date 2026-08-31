"use client";

import type { PlacementMiniatureKind } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";

/**
 * Tiny customer-layout sketches for Owner placement selection.
 * Decorative only — not live customer data.
 */
export function DeliveryAdPlacementMiniature({
  kind,
  adLabel,
}: {
  kind: PlacementMiniatureKind;
  adLabel: string;
}) {
  if (kind === "home_hero_carousel") {
    return (
      <div
        className="mt-2 w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-2"
        data-owner-ads-placement-mini="home_hero_carousel"
        aria-hidden
      >
        <div className="relative h-10 w-full rounded-sm bg-sam-surface">
          <div className="absolute inset-x-2 top-1.5 h-6 rounded-sm bg-[#0A823E]/20" />
          <span className="absolute left-3 top-2.5 text-[9px] font-bold text-[#0A823E]">
            {adLabel}
          </span>
          <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
            <span className="h-1 w-1 rounded-full bg-[#0A823E]" />
            <span className="h-1 w-1 rounded-full bg-sam-border" />
            <span className="h-1 w-1 rounded-full bg-sam-border" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "search_top_single") {
    return (
      <div
        className="mt-2 w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-2"
        data-owner-ads-placement-mini="search_top_single"
        aria-hidden
      >
        <div className="mb-1 h-2 w-3/5 rounded-sm bg-sam-border/80" />
        <div className="mb-1 flex h-7 items-center rounded-sm bg-[#0A823E]/15 px-2">
          <span className="text-[9px] font-bold text-[#0A823E]">{adLabel}</span>
        </div>
        <div className="space-y-1">
          <div className="h-2 w-full rounded-sm bg-sam-border/70" />
          <div className="h-2 w-4/5 rounded-sm bg-sam-border/50" />
        </div>
      </div>
    );
  }

  const rows =
    kind === "home_plus_category"
      ? (["organic", "ad", "organic"] as const)
      : (["organic", "organic", "ad", "organic"] as const);

  return (
    <div
      className="mt-2 w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-2"
      data-owner-ads-placement-mini={kind}
      aria-hidden
    >
      {kind === "category_interleave" || kind === "home_plus_category" ? (
        <div className="mb-1.5 text-[9px] font-semibold text-sam-muted">···</div>
      ) : null}
      <div className="space-y-1">
        {rows.map((row, i) =>
          row === "ad" ? (
            <div
              key={`ad-${i}`}
              className="flex items-center gap-1.5 rounded-sm border border-[#0A823E]/40 bg-[#0A823E]/10 px-1.5 py-1"
            >
              <span className="rounded-[3px] bg-[#f97316] px-1 text-[8px] font-bold text-white">
                {adLabel}
              </span>
              <span className="h-1.5 flex-1 rounded-sm bg-[#0A823E]/30" />
            </div>
          ) : (
            <div
              key={`org-${i}`}
              className="flex items-center gap-1.5 rounded-sm bg-sam-surface px-1.5 py-1"
            >
              <span className="h-3 w-3 rounded-sm bg-sam-border" />
              <span className="h-1.5 flex-1 rounded-sm bg-sam-border/70" />
            </div>
          )
        )}
      </div>
      {kind === "home_plus_category" ? (
        <div className="mt-2 space-y-1 border-t border-sam-border/60 pt-2">
          <div className="flex items-center gap-1.5 rounded-sm bg-sam-surface px-1.5 py-1">
            <span className="h-3 w-3 rounded-sm bg-sam-border" />
            <span className="h-1.5 flex-1 rounded-sm bg-sam-border/70" />
          </div>
          <div className="flex items-center gap-1.5 rounded-sm border border-[#0A823E]/40 bg-[#0A823E]/10 px-1.5 py-1">
            <span className="rounded-[3px] bg-[#f97316] px-1 text-[8px] font-bold text-white">
              {adLabel}
            </span>
            <span className="h-1.5 flex-1 rounded-sm bg-[#0A823E]/30" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
