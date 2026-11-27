/**
 * 언어 재감사 2026-11-27 — 공통 서버 오류 코드 → 키 표.
 * 영어 결과에 한글 0 · 한국어 결과에 서버 영어 문장 0 · 코드가 화면에 그대로 나오지 않음.
 */
import { describe, expect, it } from "vitest";
import { COMMON_API_ERROR_CODE_MAP } from "@/lib/http/common-api-error-code-map";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";
import { translate } from "@/lib/i18n/messages";
import { enforceRateLimit } from "@/lib/http/api-route";
import { MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE } from "@/lib/auth/member-account-state";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import { isPhoneVerificationRequiredError } from "@/lib/auth/phone-verification-required-detect";
import { PH_LOCAL_MOBILE_RULE_ERROR_CODE, normalizeOptionalPhMobileDb } from "@/lib/utils/ph-mobile";

const HANGUL = /[가-힣]/;

describe("COMMON_API_ERROR_CODE_MAP", () => {
  it("모든 코드 → 키 · en 결과에 한글 0 · ko 결과 비어 있지 않음", () => {
    for (const [code, key] of Object.entries(COMMON_API_ERROR_CODE_MAP)) {
      const en = resolveApiErrorText({
        json: { ok: false, error: code, code },
        map: COMMON_API_ERROR_CODE_MAP,
        fallbackKey: "net_dibay_error",
        t: (k, v) => translate("en", k, v),
      });
      const ko = resolveApiErrorText({
        json: { ok: false, error: code, code },
        map: COMMON_API_ERROR_CODE_MAP,
        fallbackKey: "net_dibay_error",
        t: (k, v) => translate("ko", k, v),
      });
      expect(en, code).toBe(translate("en", key));
      expect(HANGUL.test(en), `${code} en`).toBe(false);
      expect(ko.trim().length, `${code} ko`).toBeGreaterThan(0);
      expect(ko, code).not.toBe(code);
    }
  });

  it("공통 함수가 보내는 코드가 표에 모두 있다", () => {
    for (const code of [
      MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
      STORE_PHONE_GATE_MESSAGE,
      PH_LOCAL_MOBILE_RULE_ERROR_CODE,
      "unauthorized",
      "profile_not_found",
      "supabase_unconfigured",
      "internal_error",
      "temporarily_unavailable",
      "profile_incomplete",
      "report_rate_limited",
      "upload_rate_limited",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(COMMON_API_ERROR_CODE_MAP, code), code).toBe(true);
      expect(HANGUL.test(code)).toBe(false);
    }
  });

  it("전화 인증 필요 코드는 기존 판정(문자열)으로도 잡힌다", () => {
    expect(isPhoneVerificationRequiredError(STORE_PHONE_GATE_MESSAGE)).toBe(true);
  });

  it("휴대전화 형식 오류는 코드만 돌려준다", () => {
    const r = normalizeOptionalPhMobileDb("12345");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(PH_LOCAL_MOBILE_RULE_ERROR_CODE);
  });
});

describe("enforceRateLimit 429", () => {
  it("문장 없이 code·params.retryAfterSec 만 보낸다", async () => {
    const key = `test-rl-${Math.random()}`;
    const first = await enforceRateLimit({ key, limit: 1, windowMs: 60_000, code: "upload_rate_limited" });
    expect(first.ok).toBe(true);
    const second = await enforceRateLimit({ key, limit: 1, windowMs: 60_000, code: "upload_rate_limited" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    const body = (await second.response.json()) as Record<string, unknown>;
    expect(second.response.status).toBe(429);
    expect(body.error).toBe("upload_rate_limited");
    expect(body.code).toBe("upload_rate_limited");
    expect((body.params as { retryAfterSec?: number }).retryAfterSec).toBeGreaterThan(0);
    expect(HANGUL.test(JSON.stringify(body))).toBe(false);
  });
});
