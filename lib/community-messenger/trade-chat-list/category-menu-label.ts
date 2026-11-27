import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** UI 폴백 — `t("cm_ui_trade_headline_fallback")` 와 동일 의미 */
export const DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL_KEY: MessageKey = "cm_ui_trade_headline_fallback";

/** @deprecated 테스트·레거시 비교용 — UI는 `DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL_KEY` + `t()` */
export const DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL = "거래";

export type TradeChatCategoryMetaLike = {
  name?: unknown;
  label?: unknown;
  key?: unknown;
  slug?: unknown;
  icon_key?: unknown;
  icon?: unknown;
};

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/_/g, "-") : "";
}

function collectTokens(post: Record<string, unknown>, category: TradeChatCategoryMetaLike | null | undefined): string[] {
  const tokens = new Set<string>();
  // 다양한 스키마/도메인 키를 폭넓게 수용한다(레거시/테넌트별 컬럼 차이).
  for (const raw of [
    post.trade_type,
    (post as { category_key?: unknown }).category_key,
    (post as { category?: unknown }).category,
    (post as { listing_type?: unknown }).listing_type,
    (post as { listing_kind?: unknown }).listing_kind,
    category?.icon_key,
    category?.icon,
    category?.slug,
    category?.name,
  ]) {
    const token = normalizeToken(raw);
    if (token) tokens.add(token);
  }
  return [...tokens];
}

function tokenMatches(tokens: string[], keys: string[]): boolean {
  return tokens.some((token) => keys.some((key) => token === key || token.includes(key) || key.includes(token)));
}

function metaRecord(post: Record<string, unknown>): Record<string, unknown> {
  return post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
    ? (post.meta as Record<string, unknown>)
    : {};
}

function categoryLabelFromDb(category: TradeChatCategoryMetaLike | null | undefined): string {
  const label = typeof category?.label === "string" ? category.label.trim() : "";
  if (label) return label;
  const name = typeof category?.name === "string" ? category.name.trim() : "";
  if (name) return name;
  return "";
}

/**
 * 거래 채팅 리스트 1행 카테고리 표시명 (DB 우선).
 *
 * 우선순위:
 * - categories/trade_categories 의 label/name (관리자/DB 값)
 * - posts.category 텍스트
 * - fallback 매핑(레거시/힌트 기반) — `lang` 을 받았을 때만 그 언어로(받는 사람 언어를 모르면 저장하지 않음)
 * - 최후: 빈 값 — 화면이 `defaultTradeChatCategoryMenuLabel(t)` 키로 그린다(한 언어 고정 「거래」 저장 금지)
 */
export function resolveTradeChatCategoryLabelForList(
  post: Record<string, unknown> | null | undefined,
  category: TradeChatCategoryMetaLike | null | undefined,
  lang?: AppLanguageCode
): string {
  const fromDb = categoryLabelFromDb(category);
  if (fromDb) return fromDb;
  const postCategoryText = typeof (post as any)?.category === "string" ? String((post as any).category).trim() : "";
  if (postCategoryText) return postCategoryText;
  if (!lang) return "";
  return resolveTradeChatCategoryMenuLabelFallback(post, category, lang);
}

export function defaultTradeChatCategoryMenuLabel(t: (key: MessageKey) => string): string {
  return t(DEFAULT_TRADE_CHAT_CATEGORY_MENU_LABEL_KEY);
}

/**
 * 레거시 힌트 기반 fallback (향후 카테고리 추가 시에도 “DB 라벨 우선”을 깨지 않도록)
 * - 새 카테고리는 DB 라벨로 바로 표시되며, 이 함수는 “DB가 비었을 때만” 사용된다.
 */
export function resolveTradeChatCategoryMenuLabelFallback(
  post: Record<string, unknown> | null | undefined,
  category: TradeChatCategoryMetaLike | null | undefined,
  lang: AppLanguageCode
): string {
  const key = resolveTradeChatCategoryMenuFallbackKey(post, category);
  return key ? translate(lang, key) : "";
}

/** 레거시 힌트 → 카테고리 문구 키 (없으면 null) */
export function resolveTradeChatCategoryMenuFallbackKey(
  post: Record<string, unknown> | null | undefined,
  category: TradeChatCategoryMetaLike | null | undefined
): MessageKey | null {
  const row = post ?? {};
  const meta = metaRecord(row);
  const tokens = collectTokens(row, category);

  if (
    tokenMatches(tokens, ["jobs", "job", "alba", "part-time", "parttime", "recruitment", "hire", "work", "알바", "구인", "일자리"]) ||
    meta.job_type != null ||
    meta.work_category != null ||
    meta.listing_kind === "job"
  ) {
    return "cat_trade_jobs_listing";
  }

  if (
    tokenMatches(tokens, ["exchange", "currency", "환전", "페소", "외환"]) ||
    meta.from_currency != null ||
    meta.to_currency != null ||
    meta.exchange_rate != null
  ) {
    return "cat_trade_exchange_listing";
  }

  if (
    tokenMatches(tokens, ["real-estate", "realestate", "property", "budongsan", "housing", "apt", "부동산"]) ||
    meta.deal_type != null ||
    meta.estate_type != null ||
    meta.deposit != null ||
    meta.monthly != null
  ) {
    return "cat_post_real_estate";
  }

  if (
    tokenMatches(tokens, ["used-car", "usedcar", "car", "자동차", "중고차"]) ||
    meta.car_model != null ||
    meta.car_year != null ||
    meta.mileage != null ||
    meta.car_trade != null
  ) {
    return "cat_post_car";
  }

  return null;
}
