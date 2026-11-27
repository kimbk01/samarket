import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { RIDER_API_ERROR_MAP, resolveRiderApiErrorText } from "@/lib/rider/rider-api-error-text";

const HANGUL = /[가-힣]/;
const tr = (lang: AppLanguageCode) => (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

/** 언어 재감사 2026-11-27 — 라이더 화면은 코드만 키로 */
describe("resolveRiderApiErrorText", () => {
  it("모든 코드: 영어에 한글 0 · 한국어는 카탈로그 문구 · 코드 원문 노출 0", () => {
    for (const code of Object.keys(RIDER_API_ERROR_MAP)) {
      const en = resolveRiderApiErrorText(code, tr("en"));
      expect(en, code).not.toMatch(HANGUL);
      expect(en, code).not.toContain(code);
      expect(en.length, code).toBeGreaterThan(0);
      expect(resolveRiderApiErrorText(code, tr("ko")), code).toMatch(HANGUL);
    }
  });

  it("문장·모르는 코드는 기본 문구", () => {
    expect(resolveRiderApiErrorText("Failed to fetch", tr("ko"), "ui_rider_load_failed")).toBe(
      translate("ko", "ui_rider_load_failed")
    );
    expect(resolveRiderApiErrorText("duplicate key value violates", tr("en"))).toBe(
      translate("en", "ui_rider_request_failed")
    );
    expect(resolveRiderApiErrorText("brand_new_code", tr("en"))).toBe(translate("en", "ui_rider_request_failed"));
  });
});
