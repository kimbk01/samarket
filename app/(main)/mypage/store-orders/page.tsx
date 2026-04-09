import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";

/** 소비자용 매장 주문 목록의 기준 경로. */
export default function MypageStoreOrdersPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="주문 내역"
        subtitle="배달, 픽업, 리뷰, 재주문 관리"
        backHref="/mypage"
        hideCtaStrip
      />
      <MyStoreOrdersView suppressTier1Sync />
    </div>
  );
}
