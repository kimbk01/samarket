/**
 * 알림 문구 언어 — 언어 SSOT S8-6 (`docs/audit/i18n-s8-native-plan-2026-11-08.md` §17):
 * 계정 명시값(ko/en) → 최근 활성 기기 앱 언어(`user_devices.app_language`) → en. 폐기 열 profiles 는 읽지 않는다.
 * (B-21 2026-10-28 의 profiles 대체를 대신함)
 */
import { describe, expect, it } from "vitest";
import {
  loadNotificationUserLanguage,
  resolveNotificationLanguage,
} from "@/lib/notifications/notification-user-language";

type Rows = {
  user_settings?: unknown;
  devices?: unknown[];
  settingsThrows?: boolean;
  devicesThrows?: boolean;
};

function sbWith(rows: Rows, seen: string[] = []) {
  return {
    from(table: string) {
      seen.push(table);
      if (table === "user_settings" && rows.settingsThrows) throw new Error("boom");
      if (table === "user_devices" && rows.devicesThrows) throw new Error("boom");
      const filters: Array<[string, unknown]> = [];
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          filters.push([col, v]);
          return q;
        },
        not: () => q,
        order: () => q,
        limit: async () => ({ data: rows.devices ?? [], error: null, filters }),
        maybeSingle: async () => ({ data: table === "user_settings" ? rows.user_settings ?? null : null, error: null }),
      };
      return q;
    },
  } as never;
}

describe("S8-6 loadNotificationUserLanguage", () => {
  it("계정 English → en (기기가 ko 여도)", async () => {
    expect(
      await loadNotificationUserLanguage(
        sbWith({ user_settings: { preferred_language: "en" }, devices: [{ app_language: "ko" }] }),
        "u1"
      )
    ).toBe("en");
  });

  it("계정 한국어 → ko (기기가 en 이어도)", async () => {
    expect(
      await loadNotificationUserLanguage(
        sbWith({ user_settings: { preferred_language: "ko" }, devices: [{ app_language: "en" }] }),
        "u1"
      )
    ).toBe("ko");
  });

  it("계정 비었음(기기 언어 따름) → 최근 기기 앱 언어", async () => {
    expect(
      await loadNotificationUserLanguage(
        sbWith({ user_settings: { preferred_language: "" }, devices: [{ app_language: "ko" }] }),
        "u1"
      )
    ).toBe("ko");
    expect(await loadNotificationUserLanguage(sbWith({ devices: [{ app_language: "en" }] }), "u1")).toBe("en");
  });

  it("계정·기기 모두 없음 → en (profiles 는 읽지 않음)", async () => {
    const seen: string[] = [];
    expect(await loadNotificationUserLanguage(sbWith({ user_settings: { preferred_language: "" } }, seen), "u1")).toBe(
      "en"
    );
    expect(seen).not.toContain("profiles");
  });

  it("읽기 실패 → 다음 순서로", async () => {
    expect(
      await loadNotificationUserLanguage(sbWith({ settingsThrows: true, devices: [{ app_language: "ko" }] }), "u1")
    ).toBe("ko");
    expect(
      await loadNotificationUserLanguage(
        sbWith({ user_settings: { preferred_language: "ko" }, devicesThrows: true }),
        "u1"
      )
    ).toBe("ko");
    expect(await loadNotificationUserLanguage(sbWith({ settingsThrows: true, devicesThrows: true }), "u1")).toBe("en");
  });

  it("ko/en 외 값은 무시", () => {
    expect(resolveNotificationLanguage("zh-CN", "fil")).toBe("en");
    expect(resolveNotificationLanguage("system", "ko")).toBe("ko");
  });

  it("빈 user id → 기본 ko (이전과 같음)", async () => {
    expect(await loadNotificationUserLanguage(sbWith({}), " ")).toBe("ko");
  });
});
