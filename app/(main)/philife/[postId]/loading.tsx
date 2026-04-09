import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/** 글 상세 RSC 대기 중 — 빈 화면·한 줄 로딩 대신 본문 골격으로 즉시 피드백 */
export default function PhilifePostDetailLoading() {
  return (
    <div
      className={`min-h-screen min-w-0 bg-[#f3f4f6] pb-24 pt-2 ${APP_MAIN_GUTTER_X_CLASS}`}
      aria-busy
      aria-label="글 불러오는 중"
    >
      <div className="overflow-hidden rounded-ui-rect border border-gray-100 bg-white shadow-sm">
        <div className="aspect-[16/10] max-h-[min(42vh,320px)] w-full animate-pulse bg-gray-200/75 sm:aspect-[2/1]" />
        <div className="space-y-3 p-4">
          <div className="h-5 w-20 animate-pulse rounded bg-sky-200/60" />
          <div className="h-8 w-[min(100%,28rem)] animate-pulse rounded bg-gray-200/90" />
          <div className="flex flex-wrap gap-2">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-[85%] animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-[70%] animate-pulse rounded bg-gray-100" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-gray-100 px-4 py-4">
          <div className="h-10 w-24 animate-pulse rounded-ui-rect bg-gray-100" />
          <div className="h-10 w-24 animate-pulse rounded-ui-rect bg-gray-100" />
        </div>
      </div>
      <div className="mt-4 space-y-2 rounded-ui-rect border border-gray-100 bg-white p-4 shadow-sm">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-200/80" />
        <div className="h-20 w-full animate-pulse rounded-ui-rect bg-gray-100" />
      </div>
    </div>
  );
}
