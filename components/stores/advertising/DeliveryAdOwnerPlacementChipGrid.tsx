"use client";

import {
  DELIVERY_AD_DESIGN_BOARD,
  DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE,
  DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

void DELIVERY_AD_DESIGN_BOARD;

export function DeliveryAdOwnerPlacementChipGrid<T extends string>({
  options,
  selected,
  onSelect,
  labelFor,
  helpFor,
}: {
  options: readonly T[];
  selected: T | "";
  onSelect: (key: T) => void;
  labelFor: (key: T) => string;
  helpFor?: (key: T) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-owner-ads-placement-grid="design-board">
      {options.map((key) => {
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            className={`flex min-h-[72px] flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left transition ${
              isSelected ? DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED : DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE
            }`}
            onClick={() => onSelect(key)}
            aria-pressed={isSelected}
            data-owner-ads-placement-key={key}
          >
            <span className="text-[14px] font-bold text-sam-fg">{labelFor(key)}</span>
            {helpFor ? (
              <span className="mt-1 text-[12px] leading-snug text-sam-muted">{helpFor(key)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
