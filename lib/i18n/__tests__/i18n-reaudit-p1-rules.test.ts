/** 재감사 2026-11-27 P1 — 새 검사 규칙·가입 문구 언어 (`docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`) */
import { describe, expect, it } from "vitest";
import { countClientRawServerError, isKoLatinOnly } from "@/lib/i18n/quality/i18n-quality-rules";
import { verifySmsBody } from "@/lib/auth/phone-verify-sms";
import { resolvePublicPhoneGuideText } from "@/lib/auth/phone-verification-public-settings";
import { isOAuthSystemDisplayName, resolveOAuthSeedDisplayName } from "@/lib/auth/oauth-seed-display-name";

describe("ko-latin-only — 한국어 값이 영어", () => {
  it("주소 「House」 같은 영어 한국어 값을 잡는다", () => {
    expect(isKoLatinOnly("House")).toBe(true);
    expect(isKoLatinOnly("Store · {name}")).toBe(true);
    expect(isKoLatinOnly("Cash")).toBe(true);
  });
  it("한글·브랜드·치환값만인 값은 잡지 않는다", () => {
    expect(isKoLatinOnly("집")).toBe(false);
    expect(isKoLatinOnly("telRING")).toBe(false);
    expect(isKoLatinOnly("DIBAY MARKET")).toBe(false);
    expect(isKoLatinOnly("{count}/{max}")).toBe(false);
    expect(isKoLatinOnly("{kind} · {duration}")).toBe(false);
  });
});

describe("client-raw-server-error — 서버 문장 그대로 표시", () => {
  it("서버 error 를 먼저 쓰는 형태를 센다", () => {
    expect(countClientRawServerError(`setError(json?.error || t("x"));`)).toBe(1);
    expect(countClientRawServerError(`const m = String(data.error ?? t("common_save_failed"));`)).toBe(1);
    expect(countClientRawServerError(`setDeleteErr(j.error);`)).toBe(1);
  });
  it("공통 함수·주석은 세지 않는다", () => {
    expect(countClientRawServerError(`setError(profileSaveErrorText({ json, status }, t));`)).toBe(0);
    expect(countClientRawServerError(`// setError(json.error || t("x"))`)).toBe(0);
  });
});

describe("인증 문자 언어 (A2)", () => {
  it("한국 번호는 화면 언어", () => {
    expect(verifySmsBody({ country: "KR" }, "123456", "ko")).toBe("[DIBAY] 인증번호: 123456");
    expect(verifySmsBody({ country: "KR" }, "123456", "en")).toBe("[DIBAY] Verification code: 123456");
  });
  it("필리핀 번호는 영어 그대로 (한글 발송 미확인)", () => {
    expect(verifySmsBody({ country: "PH" }, "123456", "ko")).toBe("[DIBAY] Verification code: 123456");
  });
  it("한국어 문자 90byte 이내 (EUC-KR 한글 2byte)", () => {
    const body = verifySmsBody({ country: "KR" }, "123456", "ko");
    const bytes = [...body].reduce((n, ch) => n + (/[가-힣]/.test(ch) ? 2 : 1), 0);
    expect(bytes).toBeLessThanOrEqual(90);
  });
});

describe("전화 안내 문구 언어 (A4)", () => {
  it("영어 화면은 한국어 문구를 비운다", () => {
    expect(resolvePublicPhoneGuideText("필리핀(+63)·한국(+82) 휴대폰 번호만 인증할 수 있습니다.", "en")).toBe("");
  });
  it("한국어 화면은 영어로만 쓴 문구를 비운다", () => {
    expect(resolvePublicPhoneGuideText("PH numbers only", "ko")).toBe("");
    expect(resolvePublicPhoneGuideText("필리핀(+63)·한국(+82) 휴대폰 번호만 인증할 수 있습니다.", "ko")).toContain("필리핀");
  });
});

describe("SNS 임시 닉네임 언어 (A1)", () => {
  it("이름이 없으면 가입 언어의 임시 닉네임", () => {
    expect(resolveOAuthSeedDisplayName(null, "en")).toBe("DIBAY user");
    expect(resolveOAuthSeedDisplayName("  ", "ko")).toBe("DIBAY 사용자");
    expect(resolveOAuthSeedDisplayName("Kim", "ko")).toBe("Kim");
  });
  it("ko·en 임시 닉네임 모두 교체 대상", () => {
    expect(isOAuthSystemDisplayName("DIBAY 사용자")).toBe(true);
    expect(isOAuthSystemDisplayName("DIBAY user")).toBe(true);
    expect(isOAuthSystemDisplayName("Kim")).toBe(false);
  });
});
