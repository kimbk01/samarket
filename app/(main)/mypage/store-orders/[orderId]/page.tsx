import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderDetailPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="주문 상세"
        subtitle="배달, 픽업 주문 상세"
        backHref="/mypage/store-orders"
        ariaLabel="이전 화면"
        preferHistoryBack
        hideCtaStrip
        rightSlot={<CommerceCartHeaderLink />}
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <MyStoreOrderDetailView />
      </div>
    </div>
  );
}
