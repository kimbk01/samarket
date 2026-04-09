import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageRecentViewedPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="최근 본 글"
        subtitle="상품·게시물 다시 보기"
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} py-4`}>
        <RecentViewedList />
      </div>
    </div>
  );
}
