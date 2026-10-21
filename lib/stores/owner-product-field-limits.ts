/**
 * 3-E PRD-15 — 오너 상품 입력 상한 (POST·PATCH 공용 서버 검증 SSOT).
 *
 * - 상품명 120자: 관리자 상품 편집과 같은 기준.
 * - 기존 행 값이 상한을 넘어도 **그 필드를 바꿀 때만** 검증한다 (PATCH 는 값이 바뀐 필드만 넘긴다 — 보존 계약).
 * - 옵션 추가금 상한은 `owner-product-options-validate.ts` (`OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX`).
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

export const OWNER_PRODUCT_TITLE_MAX = 120;
export const OWNER_PRODUCT_SUMMARY_MAX = 500;
export const OWNER_PRODUCT_PRICE_MAX = 10_000_000;
export const OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX = 1_000_000;
export const OWNER_PRODUCT_STOCK_MAX = 999_999;

export type OwnerProductFieldLimitError =
  | "title_too_long"
  | "summary_too_long"
  | "price_too_large"
  | "stock_too_large";

export type OwnerProductFieldsInput = {
  title?: string | null;
  summary?: string | null;
  price?: number | null;
  stock_qty?: number | null;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** 넘긴 필드만 검사 (undefined = 미변경). 문자열은 trim 후 길이. */
export function validateOwnerProductFields(
  fields: OwnerProductFieldsInput,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): { ok: true } | { ok: false; error: OwnerProductFieldLimitError; message: string } {
  if (typeof fields.title === "string" && fields.title.trim().length > OWNER_PRODUCT_TITLE_MAX) {
    return {
      ok: false,
      error: "title_too_long",
      message: translate(lang, "store_owner_prd_title_too_long", { max: OWNER_PRODUCT_TITLE_MAX }),
    };
  }
  if (typeof fields.summary === "string" && fields.summary.trim().length > OWNER_PRODUCT_SUMMARY_MAX) {
    return {
      ok: false,
      error: "summary_too_long",
      message: translate(lang, "store_owner_prd_summary_too_long", { max: OWNER_PRODUCT_SUMMARY_MAX }),
    };
  }
  if (typeof fields.price === "number" && Number.isFinite(fields.price) && fields.price > OWNER_PRODUCT_PRICE_MAX) {
    return {
      ok: false,
      error: "price_too_large",
      message: translate(lang, "store_owner_prd_price_too_large", { max: fmt(OWNER_PRODUCT_PRICE_MAX) }),
    };
  }
  if (
    typeof fields.stock_qty === "number" &&
    Number.isFinite(fields.stock_qty) &&
    fields.stock_qty > OWNER_PRODUCT_STOCK_MAX
  ) {
    return {
      ok: false,
      error: "stock_too_large",
      message: translate(lang, "store_owner_prd_stock_too_large", { max: fmt(OWNER_PRODUCT_STOCK_MAX) }),
    };
  }
  return { ok: true };
}

/** 오너 상품 POST 멱등 키 — 폼이 마운트 시 고정 생성 (uuid 등). 형식이 다르면 무시(멱등 미적용). */
export function parseOwnerProductClientRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length < 8 || v.length > 100) return null;
  return /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
}
