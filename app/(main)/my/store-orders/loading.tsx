import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/** 라우트 세그먼트 진입 직후 즉시 표시 — 클라이언트 번들·데이터 전 체감 지연 완화 */
export default function MyStoreOrdersLoading() {
  return (
    <div className={`min-h-[50vh] bg-sam-app pb-10 dark:bg-[#18191A] ${APP_MAIN_GUTTER_X_CLASS} pt-2 sm:pt-3`}>
      <div
        className="mb-3 h-12 animate-pulse rounded-ui-rect bg-sam-surface/90 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]"
        aria-hidden
      />
      <div
        className="rounded-ui-rect bg-sam-surface px-4 py-12 text-center sam-text-body text-[#65676B] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:text-[#B0B3B8] dark:ring-sam-surface/[0.08]"
      >
        불러오는 중…
      </div>
    </div>
  );
}
