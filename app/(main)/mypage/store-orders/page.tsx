import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { APP_MAIN_FEED_STACK_CLASS } from "@/lib/ui/app-content-layout";

/**
 * `ConditionalAppShell`이 이미 `APP_MAIN_COLUMN`으로 `children`을 감싸므로,
 * 여기서는 컬럼을 반복하지 않고 `APP_MAIN_FEED_STACK` + 하단 탭 스크롤만 맞는다.
 */
export default function MypageStoreOrdersPage() {
  return (
    <div className="flex w-full min-w-0 min-h-0 flex-1 flex-col bg-sam-app">
      <MySubpageHeader
        title="주문 내역"
        subtitle="배달, 픽업, 리뷰, 재주문 관리"
        backHref="/mypage"
        hideCtaStrip
      />
      <div
        className={`min-h-0 w-full min-w-0 flex-1 ${APP_MAIN_FEED_STACK_CLASS}`}
      >
        <MyStoreOrdersView suppressTier1Sync />
      </div>
    </div>
  );
}
