import { describe, expect, it } from "vitest";
import {
  decideAccountLanguageSync,
  displayLanguageCookieValue,
  resolveClientAppLanguage,
  resolveServerAppLanguage,
} from "@/lib/i18n/app-language-authority";

const KO_DEVICE = ["ko-KR", "en-US"];
const EN_DEVICE = ["en-US"];
const FIL_DEVICE = ["fil-PH", "tl"];

/** `docs/i18n-ssot.md` §2 표 — 행마다 1개 이상 */
describe("앱 언어 결정 계약", () => {
  it("비로그인·선택 없음 → 매번 기기 언어 (첫 언어가 한국어 → ko, 그 외 → en)", () => {
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: KO_DEVICE })).toEqual({
      resolved: "ko",
      preference: null,
      source: "device-language",
    });
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: EN_DEVICE }).resolved).toBe("en");
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: FIL_DEVICE }).resolved).toBe("en");
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: [] }).resolved).toBe("en");
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: ["en-US", "ko-KR"] }).resolved).toBe("en");
  });

  it("기기 언어를 바꾸면 선택 없는 사용자는 바로 따라간다 (저장된 값 없음)", () => {
    const before = resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: EN_DEVICE });
    const after = resolveClientAppLanguage({ isLoggedIn: false, deviceLanguages: KO_DEVICE });
    expect([before.resolved, after.resolved]).toEqual(["en", "ko"]);
  });

  it("비로그인·토글로 선택 → 선택값이 기기 언어를 이긴다", () => {
    expect(resolveClientAppLanguage({ isLoggedIn: false, deviceChoice: "en", deviceLanguages: KO_DEVICE })).toEqual({
      resolved: "en",
      preference: "en",
      source: "device-choice",
    });
  });

  it("로그인·계정 값 있음 → 계정 값이 기기 선택·기기 언어를 이긴다 (기기 간·계정 전환)", () => {
    expect(
      resolveClientAppLanguage({ isLoggedIn: true, account: "en", deviceChoice: "ko", deviceLanguages: KO_DEVICE })
    ).toEqual({ resolved: "en", preference: "en", source: "account" });
  });

  it("로그인·미전송 토글 → 미전송 값이 계정 값보다 먼저 (저장 확인 전 화면 유지)", () => {
    expect(
      resolveClientAppLanguage({ isLoggedIn: true, pending: "ko", account: "en", deviceLanguages: EN_DEVICE }).source
    ).toBe("pending");
  });

  it("로그인·계정 값 없음 → 이 기기의 선택으로 보여 주기만 (preference=null, 계정에 저장하지 않음)", () => {
    expect(
      resolveClientAppLanguage({ isLoggedIn: true, account: "", deviceChoice: "en", deviceLanguages: KO_DEVICE })
    ).toEqual({ resolved: "en", preference: null, source: "device-choice" });
    expect(
      resolveClientAppLanguage({ isLoggedIn: true, account: "system", deviceLanguages: KO_DEVICE }).source
    ).toBe("device-language");
  });

  it("로그아웃 → 계정 값은 쓰지 않는다", () => {
    expect(
      resolveClientAppLanguage({ isLoggedIn: false, account: "en", pending: "en", deviceLanguages: KO_DEVICE }).resolved
    ).toBe("ko");
  });

  it("화면 언어 쿠키 — 기기 언어를 따르면 없음", () => {
    expect(displayLanguageCookieValue({ resolved: "ko", preference: null, source: "device-language" })).toBeNull();
    expect(displayLanguageCookieValue({ resolved: "en", preference: null, source: "device-choice" })).toBe("en");
    expect(displayLanguageCookieValue({ resolved: "en", preference: "en", source: "account" })).toBe("en");
  });
});

describe("계정 동기화 — 기기 값이 계정 값을 덮지 않는다", () => {
  it("미전송 없음 → 아무것도 올리지 않는다", () => {
    expect(decideAccountLanguageSync({ pending: null, remote: "ko" })).toEqual({ upload: null, clearPending: false });
    expect(decideAccountLanguageSync({ pending: null, remote: null })).toEqual({ upload: null, clearPending: false });
  });

  it("미전송이 서버와 같으면 지운다", () => {
    expect(decideAccountLanguageSync({ pending: "en", remote: "en" })).toEqual({ upload: null, clearPending: true });
  });

  it("미전송이 서버와 다르면 미전송만 올린다", () => {
    expect(decideAccountLanguageSync({ pending: "en", remote: "ko" })).toEqual({ upload: "en", clearPending: false });
    expect(decideAccountLanguageSync({ pending: "en", remote: null })).toEqual({ upload: "en", clearPending: false });
  });
});

describe("서버 언어 — 계정 → 쿠키 → Accept-Language → en (서버 기본 ko 없음)", () => {
  it("순서대로 고른다", () => {
    expect(resolveServerAppLanguage({ account: "en", cookie: "ko", acceptLanguage: "ko-KR" })).toBe("en");
    expect(resolveServerAppLanguage({ account: "", cookie: "ko", acceptLanguage: "en-US" })).toBe("ko");
    /** 첫 언어 기준 (Owner 2026-11-08) — 뒤 순위 ko 는 보지 않는다 */
    expect(resolveServerAppLanguage({ acceptLanguage: "fil-PH,ko;q=0.5" })).toBe("en");
    expect(resolveServerAppLanguage({ acceptLanguage: "ko-KR,en;q=0.5" })).toBe("ko");
    expect(resolveServerAppLanguage({ acceptLanguage: "fil-PH" })).toBe("en");
    expect(resolveServerAppLanguage({})).toBe("en");
  });
});
