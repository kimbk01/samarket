import {
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_GUTTER_X_CLASS,
} from "@/lib/ui/app-content-layout";

/**
 * TRADE 본문 래퍼
 * 부모 컬럼 거터를 상쇄한 뒤 동일 기준으로 목록을 다시 맞춘다.
 */
export const TRADE_CONTENT_SHELL_CLASS = `${APP_MAIN_GUTTER_NEG_X_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;
