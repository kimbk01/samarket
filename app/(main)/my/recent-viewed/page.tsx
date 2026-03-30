import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";

export default function RecentViewedPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="최근 본 글"
        subtitle="상품·게시물 다시 보기"
        backHref="/mypage"
        section="board"
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        <RecentViewedList />
      </div>
    </div>
  );
}
