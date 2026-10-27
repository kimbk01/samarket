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
 * 거래 J H-2 (Owner 지적 2026-10-28): 「포인트 홍보」는 스크롤 칸의 **마지막 칩**이다.
 * 예전에는 `trailing`(스크롤 칸 밖·줄어들지 않음)이라 384px 폰에서 칩 4개 칸이 좁아져 「숨김」을 가렸다.
 * 공용 `DibaySecondaryTabRow` 는 바꾸지 않는다(같은 칸을 쓰는 다른 화면 보호). `promoted=1` 주소 계약 그대로.
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
      <button
        type="button"
        role="tab"
        aria-selected={promotedOnly}
        aria-label={promotedAria}
        title={promotedAria}
        onClick={() => onPromotedOnlyChange(!promotedOnly)}
        className={dibaySecondaryTabClass(promotedOnly)}
      >
        <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{promotedLabel}</span>
      </button>
    </DibaySecondaryTabRow>
  );
}
