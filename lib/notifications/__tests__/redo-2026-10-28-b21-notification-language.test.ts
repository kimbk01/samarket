/**
 * 재감사 2026-10-28 B-21 — 알림 문구 언어: user_settings(앱 언어) 우선, 비었거나 기기 언어면 profiles.
 */
import { describe, expect, it } from "vitest";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";

function sbWith(rows: { user_settings?: unknown; profiles?: unknown; settingsThrows?: boolean }) {
  return {
    from(table: string) {
      if (table === "user_settings" && rows.settingsThrows) throw new Error("boom");
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === "user_settings" ? rows.user_settings ?? null : rows.profiles ?? null,
          error: null,
        }),
      };
      return q;
    },
  } as never;
}

describe("B-21 loadNotificationUserLanguage", () => {
  it("앱 설정 English → en (profiles 가 ko 여도)", async () => {
    expect(
      await loadNotificationUserLanguage(sbWith({ user_settings: { preferred_language: "en" }, profiles: { preferred_language: "ko" } }), "u1")
    ).toBe("en");
  });

  it("앱 설정 한국어 → ko (profiles 가 en 이어도)", async () => {
    expect(
      await loadNotificationUserLanguage(sbWith({ user_settings: { preferred_language: "ko" }, profiles: { preferred_language: "en" } }), "u1")
    ).toBe("ko");
  });

  it("앱 설정 비었거나 기기 언어 → profiles", async () => {
    expect(
      await loadNotificationUserLanguage(sbWith({ user_settings: { preferred_language: "" }, profiles: { preferred_language: "ko" } }), "u1")
    ).toBe("ko");
    expect(await loadNotificationUserLanguage(sbWith({ profiles: { preferred_language: "en" } }), "u1")).toBe("en");
  });

  it("user_settings 읽기 실패 → profiles 폴백", async () => {
    expect(
      await loadNotificationUserLanguage(sbWith({ settingsThrows: true, profiles: { preferred_language: "ko" } }), "u1")
    ).toBe("ko");
  });

  it("빈 user id → 기본 ko", async () => {
    expect(await loadNotificationUserLanguage(sbWith({}), " ")).toBe("ko");
  });
});
