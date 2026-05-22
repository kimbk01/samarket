import type { MessageKey } from "@/lib/i18n/messages";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { OWNER_RECOMMENDED_MENU_MAX } from "@/lib/stores/owner-recommended-menu-limit";

export type OwnerProductRegisterErrorKind = "owner_recommended_limit" | "generic";

export type OwnerProductRegisterErrorModal = {
  kind: OwnerProductRegisterErrorKind;
  title: string;
  description: string;
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

function registerTitle(mode: "new" | "edit", t: TranslateFn): string {
  return mode === "new" ? t("business_phase7_494") : t("business_phase7_495");
}

/** API·클라이언트 검증 실패 → 등록/저장 에러 팝업 payload */
export function resolveOwnerProductRegisterError(
  input: { error?: string; message?: string } | string,
  mode: "new" | "edit",
  t: TranslateFn
): OwnerProductRegisterErrorModal {
  if (typeof input === "string") {
    const description = input.trim() || t("common_error");
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description,
    };
  }

  const code = typeof input.error === "string" ? input.error.trim() : "";
  const apiMessage =
    typeof input.message === "string" && input.message.trim() ? input.message.trim() : "";

  if (code === "owner_recommended_limit") {
    return {
      kind: "owner_recommended_limit",
      title: t("business_phase7_490"),
      description:
        apiMessage ||
        t("business_phase7_491", { v1: OWNER_RECOMMENDED_MENU_MAX }),
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
  if (code === "detail_image_overlaps_thumbnail" && apiMessage) {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: apiMessage,
    };
  }
  if (code === "invalid_options_json" && apiMessage) {
    return {
      kind: "generic",
      title: registerTitle(mode, t),
      description: apiMessage,
    };
  }

  const fallback =
    apiMessage ||
    (code ? resolveOwnerApiErrorMessage(code, t) : "") ||
    (mode === "new" ? t("business_phase7_367") : t("business_phase7_368"));

  return {
    kind: "generic",
    title: registerTitle(mode, t),
    description: fallback,
  };
}
