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

/**
 * STATUS FILTER — single 44px `DibaySecondaryTabRow` (sell hub chrome height SSOT).
 * Point-promoted overlay = trailing pill (not a second row — avoids sell↔products stutter).
 */
export function MyProductFilter({
  value,
  onChange,
  promotedOnly,
  onPromotedOnlyChange,
}: MyProductFilterProps) {
  const { safeT } = useI18n();
  const promotedLabel = safeT("marketplace_seller_promoted_only", {
    fallbackKo: "포인트 홍보",
    fallbackEn: "Point promoted",
  });
  const promotedAria = safeT("marketplace_seller_promoted_only_aria", {
    fallbackKo: "포인트로 목록에 노출 중인 홍보 매물만 보기",
    fallbackEn: "Show only listings promoted with Point",
  });

  return (
    <DibaySecondaryTabRow
      bordered
      navRole="secondary"
      trackAriaLabel={safeT("marketplace_seller_products_title", {
        fallbackKo: "내 매물",
        fallbackEn: "My listings",
      })}
      trailing={
        <button
          type="button"
          role="tab"
          aria-selected={promotedOnly}
          aria-label={promotedAria}
          title={promotedAria}
          onClick={() => onPromotedOnlyChange(!promotedOnly)}
          className={`${dibaySecondaryTabClass(promotedOnly)} shrink-0`}
        >
          <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{promotedLabel}</span>
        </button>
      }
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
  );
}
