import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorText } from "@/lib/business/owner-api-error-text";
import { isApiErrorCode, pickApiErrorParams } from "@/lib/i18n/api-error-text";
import { OWNER_RECOMMENDED_MENU_MAX } from "@/lib/stores/owner-recommended-menu-limit";

export type OwnerProductRegisterErrorKind = "owner_recommended_limit" | "generic";

export type OwnerProductRegisterErrorModal = {
  kind: OwnerProductRegisterErrorKind;
  title: string;
  description: string;
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * 옵션 검사 실패 코드 — 서버 `message` 문장 대신 키 (재감사 2026-11-27).
 * 사후 검토 E2: 중복 그룹·중복 선택지는 서버 `params`(`groupIndex`·`name`)로 구체 문구, 값이 없으면 일반 옵션 문구.
 */
function ownerOptionsErrorText(
  code: string,
  params: Record<string, string | number> | undefined,
  t: TranslateFn
): string | null {
  if (code !== "invalid_options_json" && code !== "duplicate_option_name" && code !== "duplicate_option_group_id") {
    return null;
  }
  const groupIndex = params?.groupIndex;
  const group = groupIndex != null ? t("store_owner_opt_group_label", { index: groupIndex }) : null;
  if (code === "duplicate_option_group_id" && group) {
    return t("store_owner_opt_duplicate_group_id", { group });
  }
  if (code === "duplicate_option_name" && group && params?.name != null) {
    return t("store_owner_opt_duplicate_choice_name", { group, name: params.name });
  }
  return t("store_owner_opt_invalid_json");
}

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
  input: { error?: string; message?: string; params?: unknown } | string,
  mode: "new" | "edit",
  t: TranslateFn
): OwnerProductRegisterErrorModal {
  if (typeof input === "string") {
    const raw = input.trim();
    // IMG-02: 업로드 오류 코드(`file_too_large` 등)는 원문 코드 대신 i18n 문구
    const description = !raw
      ? t("common_error")
      : isApiErrorCode(raw)
        ? resolveOwnerApiErrorText(raw, t, registerFallbackKey(mode))
        : raw;
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description,
    };
  }

  const code = typeof input.error === "string" ? input.error.trim() : "";
  /** E2 사후 검토 2026-11-27 — 한도 숫자 등은 서버 `params` (서버 `message` 문장은 쓰지 않는다) */
  const params = pickApiErrorParams(input);

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
  const optionsText = ownerOptionsErrorText(code, params, t);
  if (optionsText) {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: optionsText,
    };
  }

  /** `detail_image_overlaps_thumbnail`·`title_too_long` 등은 `OWNER_API_ERROR_MAP` 키 · 모르는 코드는 등록/저장 실패 문구 */
  const fallback = resolveOwnerApiErrorText(code, t, registerFallbackKey(mode), params);

  return {
    kind: "generic",
    title: registerTitle(mode, t),
    description: fallback,
  };
}
