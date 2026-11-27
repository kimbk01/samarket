import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  apiStatusFallbackKey,
  pickApiErrorCode,
  pickApiErrorParams,
  resolveApiErrorText,
} from "@/lib/i18n/api-error-text";

const tKo = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);
const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
const HANGUL = /[가-힣]/;

describe("api-error-text — 서버 문장을 화면에 내보내지 않는다", () => {
  it("한국어 문장 error 는 코드로 보지 않는다", () => {
    expect(pickApiErrorCode({ error: "로그인이 필요합니다." })).toBeNull();
    expect(pickApiErrorCode({ error: "Too many requests" })).toBeNull();
    expect(pickApiErrorCode({ error: "nickname_taken" })).toBe("nickname_taken");
    expect(pickApiErrorCode({ error: "문장", code: "nickname_taken" })).toBe("nickname_taken");
  });

  it("영어 화면에 서버 한국어 문장이 나오지 않는다 (코드 없음·표 없음)", () => {
    const text = resolveApiErrorText({
      json: { ok: false, error: "프로필 행을 찾을 수 없습니다." },
      status: 409,
      fallbackKey: "profile_edit_save_failed",
      t: tEn,
    });
    expect(text).toBe(tEn("profile_edit_save_failed"));
    expect(HANGUL.test(text)).toBe(false);
  });

  it("한국어 화면에 서버 영어 문장·코드가 나오지 않는다", () => {
    const text = resolveApiErrorText({
      json: { ok: false, error: "unknown_server_code" },
      status: 400,
      fallbackKey: "profile_edit_save_failed",
      t: tKo,
    });
    expect(text).toBe(tKo("profile_edit_save_failed"));
  });

  it("코드 → 도메인 표 키, params 치환", () => {
    const text = resolveApiErrorText({
      json: { ok: false, error: "x", code: "nick_max", params: { max: 20, bad: { nested: true } } },
      map: { nick_max: "profile_edit_err_nickname_max" },
      fallbackKey: "common_error",
      t: tEn,
    });
    expect(text).toBe(tEn("profile_edit_err_nickname_max"));
    expect(pickApiErrorParams({ params: { max: 20, bad: { nested: true } } })).toEqual({ max: 20 });
  });

  it("직접 넘긴 code 가 json 보다 먼저", () => {
    const text = resolveApiErrorText({
      code: "nick_max",
      json: { error: "nick_min" },
      map: { nick_max: "profile_edit_err_nickname_max", nick_min: "profile_edit_err_nickname_min" },
      fallbackKey: "common_error",
      t: tKo,
    });
    expect(text).toBe(tKo("profile_edit_err_nickname_max"));
  });

  it("상태 번호 → 공통 키", () => {
    expect(apiStatusFallbackKey(401)).toBe("common_login_required");
    expect(apiStatusFallbackKey(403)).toBe("common_api_forbidden");
    expect(apiStatusFallbackKey(429)).toBe("common_api_too_many_requests");
    expect(apiStatusFallbackKey(503)).toBe("net_dibay_error");
    expect(apiStatusFallbackKey(400)).toBeNull();
  });
});
