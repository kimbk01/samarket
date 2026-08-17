"use client";

import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { MY_PRODUCT_FILTER_OPTIONS } from "@/lib/products/status-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

const FILTER_LABEL_KEY: Record<MyProductFilterKey, MessageKey> = {
  all: "common_all",
  active: "trade_listing_step_inquiry",
  sold: "trade_listing_step_completed",
  hidden: "mypage_comp_product_status_hidden",
};

const FILTER_FALLBACK_EN: Record<MyProductFilterKey, string> = {
  all: "All",
  active: "For sale",
  sold: "Sold",
  hidden: "Hidden",
};

interface MyProductFilterProps {
  value: MyProductFilterKey;
  onChange: (value: MyProductFilterKey) => void;
  promotedOnly: boolean;
  onPromotedOnlyChange: (value: boolean) => void;
}

export function MyProductFilter({
  value,
  onChange,
  promotedOnly,
  onPromotedOnlyChange,
}: MyProductFilterProps) {
  const { safeT } = useI18n();
  return (
    <div className="sam-tabs sam-tabs--scroll mb-3">
      {MY_PRODUCT_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`${APP_TOP_MENU_ROW1_BASE} ${
            value === opt.value ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
          }`}
        >
          {safeT(FILTER_LABEL_KEY[opt.value], {
            fallbackKo: opt.label,
            fallbackEn: FILTER_FALLBACK_EN[opt.value],
          })}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={promotedOnly}
        onClick={() => onPromotedOnlyChange(!promotedOnly)}
        className={`${APP_TOP_MENU_ROW1_BASE} ${
          promotedOnly ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
        }`}
      >
        {safeT("trade_promo_badge", { fallbackKo: "홍보만 보기", fallbackEn: "Promoted only" })}
      </button>
    </div>
  );
}
