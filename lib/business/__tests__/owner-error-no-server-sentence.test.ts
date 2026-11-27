import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { resolveOwnerProductRegisterError } from "@/lib/business/owner-product-register-error";
import { formatOwnerOrderPatchErr } from "@/lib/business/owner-order-patch-errors";
import { ownerProductStatusBlockText } from "@/lib/stores/store-product-admin-lock";

const HANGUL = /[가-힣]/;
const tr =
  (lang: AppLanguageCode) =>
  (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

const SERVER_KO = "서버가 보낸 한국어 문장입니다.";
const SERVER_EN = "Server sent this English sentence.";

describe("사장님 오류 문구 — 서버 문장·모르는 코드는 기본 키 (재감사 2026-11-27)", () => {
  it("resolveOwnerApiErrorMessage: 문장·모르는 코드 → 기본 키", () => {
    for (const lang of ["ko", "en"] as const) {
      const t = tr(lang);
      expect(resolveOwnerApiErrorMessage(SERVER_KO, t)).toBe(t("business_phase7_426"));
      expect(resolveOwnerApiErrorMessage(SERVER_EN, t)).toBe(t("business_phase7_426"));
      expect(resolveOwnerApiErrorMessage("some_unknown_code", t)).toBe(t("business_phase7_426"));
      expect(resolveOwnerApiErrorMessage("network_error", t)).toBe(t("common_network_error"));
    }
    expect(HANGUL.test(resolveOwnerApiErrorMessage(SERVER_KO, tr("en")))).toBe(false);
  });

  it("상품 등록 오류: 서버 message 를 쓰지 않는다", () => {
    for (const lang of ["ko", "en"] as const) {
      const t = tr(lang);
      for (const error of ["owner_recommended_limit", "detail_image_overlaps_thumbnail", "invalid_options_json", "x_unknown"]) {
        const msg = lang === "en" ? SERVER_KO : SERVER_EN;
        const out = resolveOwnerProductRegisterError({ error, message: msg }, "new", t);
        expect(out.description).not.toBe(msg);
        if (lang === "en") expect(HANGUL.test(out.description)).toBe(false);
      }
    }
    expect(resolveOwnerProductRegisterError({ error: "x_unknown" }, "edit", tr("en")).description).toBe(
      translate("en", "business_phase7_368")
    );
  });

  it("상품 등록 오류: 화면이 만든 문구(문자열)는 그대로, 코드는 키", () => {
    const t = tr("ko");
    expect(resolveOwnerProductRegisterError(t("business_phase7_354"), "new", t).description).toBe(
      t("business_phase7_354")
    );
    expect(resolveOwnerProductRegisterError("file_too_large", "new", t).description).toBe(
      t("business_image_upload_too_large")
    );
  });

  it("주문 상태 변경 오류: 모르는 코드·문장은 원문 대신 기본 키", () => {
    for (const lang of ["ko", "en"] as const) {
      expect(formatOwnerOrderPatchErr(SERVER_KO, lang)).toBe(translate(lang, "owner_order_err_action_failed"));
      expect(formatOwnerOrderPatchErr("x_unknown", lang)).toBe(translate(lang, "owner_order_err_action_failed"));
    }
    expect(formatOwnerOrderPatchErr("invalid_transition", "en")).toBe(
      translate("en", "store_biz_patch_err_invalid_transition")
    );
  });

  it("상품 상태 잠금: 코드 + params.lock 으로 그린다", () => {
    const en = ownerProductStatusBlockText({ code: "admin_locked", lock: "hidden" }, tr("en"));
    expect(HANGUL.test(en)).toBe(false);
    expect(en).toBe(
      translate("en", "owner_product_lock_admin", { lock: translate("en", "owner_product_lock_kind_hidden") })
    );
  });
});
