"use client";

import { DeliveryAdPlacementMiniature } from "@/components/stores/advertising/DeliveryAdPlacementMiniature";
import type { PlacementMiniatureKind } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import {
  DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE,
  DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

export type OwnerPlacementVisualOption<T extends string> = {
  key: T;
  title: string;
  help: string;
  miniature: PlacementMiniatureKind;
};

/**
 * Visual placement selector — customer miniature + human copy.
 * Internal inventory keys stay on data attributes only.
 */
export function DeliveryAdOwnerPlacementVisualGrid<T extends string>({
  options,
  selected,
  onSelect,
  adTagLabel,
}: {
  options: readonly OwnerPlacementVisualOption<T>[];
  selected: T | "";
  onSelect: (key: T) => void;
  adTagLabel: string;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      data-owner-ads-placement-grid="visual-launch"
    >
      {options.map((opt) => {
        const isSelected = selected === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={`flex min-h-[120px] flex-col items-stretch rounded-ui-rect border px-3 py-3 text-left transition hover:border-[#0A823E]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:opacity-50 ${
              isSelected
                ? DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED
                : DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE
            }`}
            onClick={() => onSelect(opt.key)}
            aria-pressed={isSelected}
            data-owner-ads-placement-key={opt.key}
            data-owner-ads-placement-selected={isSelected ? "1" : "0"}
          >
            <span className="flex items-center gap-2 text-[14px] font-bold text-sam-fg">
              {isSelected ? (
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0A823E] text-[10px] text-white"
                  aria-hidden
                >
                  ✓
                </span>
              ) : (
                <span
                  className="inline-flex h-4 w-4 shrink-0 rounded-full border border-sam-border"
                  aria-hidden
                />
              )}
              {opt.title}
            </span>
            <span className="mt-1 text-[12px] leading-snug text-sam-muted">{opt.help}</span>
            <DeliveryAdPlacementMiniature kind={opt.miniature} adLabel={adTagLabel} />
          </button>
        );
      })}
    </div>
  );
}
