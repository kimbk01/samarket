import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorText } from "@/lib/business/owner-api-error-text";
import { OWNER_RECOMMENDED_MENU_MAX } from "@/lib/stores/owner-recommended-menu-limit";

export type OwnerProductRegisterErrorKind = "owner_recommended_limit" | "generic";

export type OwnerProductRegisterErrorModal = {
  kind: OwnerProductRegisterErrorKind;
  title: string;
  description: string;
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 옵션 검사 실패 코드 — 서버 `message` 문장 대신 같은 키 (재감사 2026-11-27) */
const OWNER_OPTIONS_ERROR_CODES = new Set([
  "invalid_options_json",
  "duplicate_option_name",
  "duplicate_option_group_id",
]);

function registerFallbackKey(mode: "new" | "edit"): MessageKey {
  return mode === "new" ? "business_phase7_367" : "business_phase7_368";
}

function registerTitle(mode: "new" | "edit", t: TranslateFn): string {
  return mode === "new" ? t("business_phase7_494") : t("business_phase7_495");
}

/**
 * API·클라이언트 검증 실패 → 등록/저장 에러 팝업 payload.
 * - 문자열 입력 = 화면이 만든 문구(`t()`·클라이언트 검사) 또는 코드. 코드는 키로 바꾼다.
 * - 객체 입력 = 서버 응답. 서버 `message` 문장은 쓰지 않고 `error` 코드로만 그린다 (재감사 2026-11-27).
 */
export function resolveOwnerProductRegisterError(
  input: { error?: string; message?: string } | string,
  mode: "new" | "edit",
  t: TranslateFn
): OwnerProductRegisterErrorModal {
  if (typeof input === "string") {
    const raw = input.trim();
    // IMG-02: 업로드 오류 코드(`file_too_large` 등)는 원문 코드 대신 i18n 문구
    const description = !raw
      ? t("common_error")
      : /^[a-z][a-z0-9_]*$/.test(raw)
        ? resolveOwnerApiErrorText(raw, t, registerFallbackKey(mode))
        : raw;
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description,
    };
  }

  const code = typeof input.error === "string" ? input.error.trim() : "";

  if (code === "owner_recommended_limit") {
    return {
      kind: "owner_recommended_limit",
      title: t("business_phase7_490"),
      description: t("business_phase7_491", { v1: OWNER_RECOMMENDED_MENU_MAX }),
    };
  }

  if (code === "sales_not_approved") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_362"),
    };
  }
  if (code === "migration_pending") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_363"),
    };
  }
  if (code === "menu_sections_required") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_364"),
    };
  }
  if (code === "menu_section_id_required") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_358"),
    };
  }
  if (code === "invalid_menu_section_id") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_365"),
    };
  }
  if (code === "thumbnail_required") {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("business_phase7_366"),
    };
  }
  if (OWNER_OPTIONS_ERROR_CODES.has(code)) {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: t("store_owner_opt_invalid_json"),
    };
  }

  /** `detail_image_overlaps_thumbnail` 등은 `OWNER_EXTRA_API_ERROR_MAP` 키 · 모르는 코드는 등록/저장 실패 문구 */
  const fallback = resolveOwnerApiErrorText(code, t, registerFallbackKey(mode));

  return {
    kind: "generic",
    title: registerTitle(mode, t),
    description: fallback,
  };
}
