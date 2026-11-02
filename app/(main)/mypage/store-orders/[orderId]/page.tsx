"use client";

import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { OverlayScopeProvider } from "@/components/ui/dibay-overlay/overlay-scope";

/** 주문 상세 시트(취소 요청 등, body 포털)도 같은 주문 화면 스코프 */
const ORDER_DETAIL_SCOPE = { "data-delivery-scope": "orders", "data-store-orders-surface": "mypage" } as const;

/** S31 주문 상세 — 본문 1열 40rem·16/20px(§1.8), 하단 고정 CTA 는 상세 뷰가 그린다(`MyStickyCta`). */
export default function MypageStoreOrderDetailPage() {
  const { t } = useI18n();
  return (
    <OverlayScopeProvider attrs={ORDER_DETAIL_SCOPE}>
    <MyScreen
      title={t("route_store_order_detail_title")}
      backHref="/mypage/store-orders"
      template="detail"
      headerRight={<CommerceCartHeaderLink />}
    >
      <div data-store-orders-surface="mypage" data-delivery-scope="orders">
        <MyStoreOrderDetailView />
      </div>
    </MyScreen>
    </OverlayScopeProvider>
  );
}
