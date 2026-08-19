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
import { Sam } from "@/lib/ui/sam-component-classes";

const FILTER_LABEL_KEY: Record<MyProductFilterKey, MessageKey> = {
  all: "common_all",
  active: "marketplace_seller_listing_tab_active",
  sold: "marketplace_seller_listing_tab_sold",
  hidden: "mypage_comp_product_status_hidden",
};

const FILTER_FALLBACK_KO: Record<MyProductFilterKey, string> = {
  all: "전체",
  active: "게시 중",
  sold: "판매 완료",
  hidden: "숨김",
};

const FILTER_FALLBACK_EN: Record<MyProductFilterKey, string> = {
  all: "All",
  active: "Live",
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
    <div className="space-y-2.5">
      <div className={`${Sam.tabs.barScroll} mb-0`} role="tablist" aria-label={safeT("marketplace_seller_products_title", { fallbackKo: "등록한 매물", fallbackEn: "Your listings" })}>
        {MY_PRODUCT_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`${APP_TOP_MENU_ROW1_BASE} ${
              value === opt.value ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
            }`}
          >
            {safeT(FILTER_LABEL_KEY[opt.value], {
              fallbackKo: FILTER_FALLBACK_KO[opt.value],
              fallbackEn: FILTER_FALLBACK_EN[opt.value],
            })}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="sam-text-xxs font-medium uppercase tracking-wide text-sam-meta">
          {safeT("marketplace_sell_hub_section_promotion", { fallbackKo: "홍보", fallbackEn: "Promotion" })}
        </span>
        <button
          type="button"
          aria-pressed={promotedOnly}
          onClick={() => onPromotedOnlyChange(!promotedOnly)}
          className={`${Sam.chip.base} ${promotedOnly ? Sam.chip.activeCombo : Sam.chip.inactiveCombo}`}
        >
          {safeT("marketplace_seller_promoted_only", {
            fallbackKo: "홍보 중만",
            fallbackEn: "Promoted only",
          })}
        </button>
      </div>
    </div>
  );
}
