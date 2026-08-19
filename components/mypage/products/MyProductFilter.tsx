"use client";

import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { MY_PRODUCT_FILTER_OPTIONS } from "@/lib/products/status-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import {
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

const FILTER_LABEL_KEY: Record<MyProductFilterKey, MessageKey> = {
  all: "common_all",
  active: "marketplace_seller_listing_tab_active",
  sold: "marketplace_seller_listing_tab_sold",
  hidden: "mypage_comp_product_status_hidden",
};

const FILTER_FALLBACK_KO: Record<MyProductFilterKey, string> = {
  all: "전체",
  active: "판매중",
  sold: "판매완료",
  hidden: "숨김",
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

/** STATUS FILTER — Community / Trade / Chat 2단 SSOT (`DibaySecondaryTabRow`) */
export function MyProductFilter({
  value,
  onChange,
  promotedOnly,
  onPromotedOnlyChange,
}: MyProductFilterProps) {
  const { safeT } = useI18n();
  const promotedLabel = safeT("marketplace_seller_promoted_only", {
    fallbackKo: "홍보 중만",
    fallbackEn: "Promoted only",
  });

  return (
    <div className="min-w-0">
      <DibaySecondaryTabRow
        bordered
        navRole="secondary"
        trackAriaLabel={safeT("marketplace_seller_products_title", {
          fallbackKo: "내 매물",
          fallbackEn: "My listings",
        })}
      >
        {MY_PRODUCT_FILTER_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={dibaySecondaryTabClass(active)}
            >
              <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>
                {safeT(FILTER_LABEL_KEY[opt.value], {
                  fallbackKo: FILTER_FALLBACK_KO[opt.value],
                  fallbackEn: FILTER_FALLBACK_EN[opt.value],
                })}
              </span>
            </button>
          );
        })}
      </DibaySecondaryTabRow>
      <div className={`${APP_MAIN_GUTTER_X_CLASS} pb-2 pt-1`}>
        <button
          type="button"
          aria-pressed={promotedOnly}
          onClick={() => onPromotedOnlyChange(!promotedOnly)}
          className={`${Sam.chip.base} ${promotedOnly ? Sam.chip.activeCombo : Sam.chip.inactiveCombo}`}
        >
          {promotedLabel}
        </button>
      </div>
    </div>
  );
}
