import { describe, expect, it } from "vitest";
import { mergeUserSettingsPreferredLanguage } from "@/lib/settings/reconcile-user-settings-language";

/** 계정 언어는 서버 값이 기준 — 기기 값으로 덮지 않는다 (`docs/i18n-ssot.md` §2) */
describe("mergeUserSettingsPreferredLanguage", () => {
  it("서버 값이 캐시 값을 이긴다", () => {
    expect(
      mergeUserSettingsPreferredLanguage("u1", { preferred_language: "ko" }, { preferred_language: "en" }).settings
        .preferred_language
    ).toBe("ko");
  });

  it("서버 값이 없으면(기기 따름) null 로 둔다 — 캐시 값을 올리지 않는다", () => {
    expect(
      mergeUserSettingsPreferredLanguage("u1", { preferred_language: "" }, { preferred_language: "en" }).settings
        .preferred_language
    ).toBeNull();
  });

  it("다른 설정 값은 서버 값으로 합친다", () => {
    const merged = mergeUserSettingsPreferredLanguage(
      "u1",
      { preferred_language: "en", marketing_push_enabled: true } as never,
      { marketing_push_enabled: false } as never
    ).settings as Record<string, unknown>;
    expect(merged.marketing_push_enabled).toBe(true);
    expect(merged.user_id).toBe("u1");
  });
});
