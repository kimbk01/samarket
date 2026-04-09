import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderDetailPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="주문 상세"
        subtitle="배달, 픽업 주문 상세"
        backHref="/mypage/store-orders"
        ariaLabel="이전 화면"
        preferHistoryBack
        hideCtaStrip
        rightSlot={<CommerceCartHeaderLink />}
      />
      <div className={`w-full min-w-0 py-4 ${APP_MAIN_GUTTER_X_CLASS}`}>
        <MyStoreOrderDetailView />
      </div>
    </div>
  );
}
