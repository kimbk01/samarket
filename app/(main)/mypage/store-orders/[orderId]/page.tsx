"use client";

import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { OverlayScopeProvider } from "@/components/ui/dibay-overlay/overlay-scope";

/** 주문 상세 시트(취소 요청 등, body 포털)도 같은 주문 화면 스코프 */
const ORDER_DETAIL_SCOPE = { "data-delivery-scope": "orders", "data-store-orders-surface": "mypage" } as const;

/** S31 주문 상세 — 본문 1열 40rem·16/20px(§1.8), 하단 고정 CTA 는 상세 뷰가 그린다(`MyStickyCta`). */
export default function MypageStoreOrderDetailPage() {
  const { t } = useI18n();
  return (
    <OverlayScopeProvider attrs={ORDER_DETAIL_SCOPE}>
    <div className="flex min-w-0 flex-1 flex-col bg-sam-app" data-store-orders-surface="mypage" data-delivery-scope="orders">
      <MySubpageHeader
        title={t("route_store_order_detail_title")}
        subtitle={t("route_store_order_detail_subtitle")}
        backHref="/mypage/store-orders"
        preferHistoryBack
        hideCtaStrip
        rightSlot={<CommerceCartHeaderLink />}
      />
      <div className={`${MYPAGE_SCROLL_BODY_CLASS} py-4`}>
        <div className={MYPAGE_BODY_COLUMN_CLASS}>
          <MyStoreOrderDetailView />
        </div>
      </div>
    </div>
    </OverlayScopeProvider>
  );
}
