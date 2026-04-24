import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageRecentViewedPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="최근 본 글"
        subtitle="상품·게시물 다시 보기"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <RecentViewedList />
      </div>
    </div>
  );
}
