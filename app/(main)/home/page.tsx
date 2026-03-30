import { HomeContent } from "./HomeContent";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* 메뉴~첫 게시물 간격: lib/trade/ui/post-spacing 단일 출처 — 여기서 상단 pt 두지 않음 */}
      <div
        className={`${APP_MAIN_GUTTER_X_CLASS} min-w-0 max-w-full overflow-x-hidden pt-0 pb-4`}
      >
        <HomeContent />
      </div>
    </div>
  );
}
