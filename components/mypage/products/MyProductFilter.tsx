"use client";

import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { MY_PRODUCT_FILTER_OPTIONS } from "@/lib/products/status-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { MyTabs } from "@/components/mypage/ds/MyTabs";
import { Sam } from "@/lib/ui/css-vars";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

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
 * STATUS FILTER — 내정보 공통 탭 1줄 (분류 설계 S6, 2026-11-02 — 예전 `DibaySecondaryTabRow` 알약형에서 교체).
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
  const promotedLabel = safeT("marketplace_seller_promoted_only");
  const promotedAria = safeT("marketplace_seller_promoted_only_aria");

  /**
   * 내정보 공통 탭(`MyTabs`) — 「포인트 홍보」는 거래 J H-2 결정대로 같은 줄 마지막 칸(가려지지 않게 스크롤 칸 안).
   * B-8 (후속 감사 2026-11-08): 밑줄은 화면 전체 폭(바깥 틀), 탭은 헤더 제목과 같은 본문 열(`APP_MAIN_COLUMN_CLASS`).
   * 휴대폰은 본문 열 = 화면 폭이라 이전과 같다 (거래 허브 탭 `TradeHubTopTabs` 와 같은 방식).
   */
  return (
    <div className="w-full border-b border-sam-border" data-my-product-filter-row>
    <div className={APP_MAIN_COLUMN_CLASS}>
    <MyTabs
      className="border-b-0 px-1"
      ariaLabel={safeT("marketplace_seller_products_title")}
      value={value}
      onChange={onChange}
      items={MY_PRODUCT_FILTER_OPTIONS.map((opt) => ({
        id: opt.value,
        label: safeT(FILTER_LABEL_KEY[opt.value], {
          fallbackKo: FILTER_FALLBACK_KO[opt.value],
          fallbackEn: FILTER_FALLBACK_EN[opt.value],
        }),
      }))}
      trailing={
        <button
          type="button"
          role="tab"
          aria-selected={promotedOnly}
          aria-label={promotedAria}
          title={promotedAria}
          onClick={() => onPromotedOnlyChange(!promotedOnly)}
          className={`${promotedOnly ? Sam.tabs.tabActive : Sam.tabs.tab} whitespace-nowrap`}
        >
          {promotedLabel}
        </button>
      }
    />
    </div>
    </div>
  );
}
