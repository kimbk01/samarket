import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

/** 상품/거래 글 상세 하단 액션 바 — 본문 `APP_MAIN_COLUMN` 과 동일 브레이크포인트(태블릿 폭 확장) */

export const PRODUCT_DETAIL_BOTTOM_BAR = `fixed bottom-0 left-1/2 z-30 flex h-14 min-h-[52px] max-h-[60px] w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} -translate-x-1/2 items-center gap-2 border-t border-sam-border bg-sam-surface px-3 sm:px-4 md:px-5 safe-area-pb`;

export const PRODUCT_DETAIL_CTA_BUTTON =
  "flex min-h-[44px] w-full min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-signature py-3 text-center text-[16px] font-bold text-white disabled:opacity-50";
