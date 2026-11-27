import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { ApiErrorTranslate } from "@/lib/i18n/api-error-text";
import {
  REPORT_ERROR_KEYS,
  USER_BLOCK_ERROR_KEYS,
  reportClientFailure,
  reportClientFailureFromResponse,
  reportErrorText,
  userBlockErrorText,
} from "@/lib/reports/report-block-error-text";

const HANGUL = /[가-힣]/;
const tFor = (lang: AppLanguageCode): ApiErrorTranslate => (key, vars) => translate(lang, key, vars);

describe("신고·차단 오류 코드 → 화면 문구 (재감사 2026-11-27)", () => {
  it("모든 코드: 영어 결과에 한글 0, 한국어 결과에 영어 코드 0", () => {
    for (const code of Object.keys(REPORT_ERROR_KEYS)) {
      const en = reportErrorText(reportClientFailure(code, 400), tFor("en"));
      const ko = reportErrorText(reportClientFailure(code, 400), tFor("ko"));
      expect(en, code).not.toMatch(HANGUL);
      expect(ko, code).toMatch(HANGUL);
      expect(ko).not.toContain(code);
    }
    for (const code of Object.keys(USER_BLOCK_ERROR_KEYS)) {
      const en = userBlockErrorText(reportClientFailure(code, 400), tFor("en"));
      const ko = userBlockErrorText(reportClientFailure(code, 400), tFor("ko"));
      expect(en, code).not.toMatch(HANGUL);
      expect(ko, code).toMatch(HANGUL);
      expect(ko).not.toContain(code);
    }
  });

  it("서버가 문장을 보내면 코드로 보지 않는다 — 문장은 화면에 나오지 않음", () => {
    const f = reportClientFailureFromResponse(500, { ok: false, error: "violates foreign key constraint reports_reporter_id_fkey" });
    expect(f.code).toBeNull();
    const en = reportErrorText(f, tFor("en"), "ui_report_failed");
    expect(en).not.toContain("foreign key");
    const ko = reportErrorText(reportClientFailureFromResponse(400, { ok: false, error: "이미 신고한 게시글입니다." }), tFor("en"), "ui_post_report_failed");
    expect(ko).toBe(translate("en", "ui_post_report_failed"));
  });

  it("코드 응답은 코드대로", () => {
    const f = reportClientFailureFromResponse(409, { ok: false, error: "already_reported_post", code: "already_reported_post" });
    expect(reportErrorText(f, tFor("en"))).toBe(translate("en", "ui_post_report_already_title"));
    expect(userBlockErrorText(reportClientFailure("self_block"), tFor("en"))).toBe(translate("en", "report_err_block_self"));
  });
});
