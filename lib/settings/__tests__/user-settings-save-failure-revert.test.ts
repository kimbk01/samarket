// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  USER_SETTINGS_SAVE_FAILED_EVENT,
  clearUserSettingsClientCache,
  getUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

/** D16 — 설정 저장 실패 시 화면에 저장된 것처럼 남기지 않는다(되돌림 + 실패 이벤트) */
const UID = "u-settings-1";

afterEach(() => {
  vi.unstubAllGlobals();
  clearUserSettingsClientCache();
});

function stubFetch(ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => (ok ? { ok: true, settings: JSON.parse(init?.body ?? "{}") } : { ok: false }),
    }))
  );
}

describe("updateUserSettings failure handling", () => {
  it("성공: 값 유지, true", async () => {
    stubFetch(true);
    const before = getUserSettings(UID).chat_preview_enabled ?? true;
    await expect(updateUserSettings(UID, { chat_preview_enabled: !before })).resolves.toBe(true);
    expect(getUserSettings(UID).chat_preview_enabled).toBe(!before);
  });

  it("실패(기본 revert): 이전 값으로 되돌리고 실패 이벤트", async () => {
    stubFetch(false);
    const failed = vi.fn();
    window.addEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, failed);
    const before = getUserSettings(UID).chat_preview_enabled ?? true;
    await expect(updateUserSettings(UID, { chat_preview_enabled: !before })).resolves.toBe(false);
    expect(getUserSettings(UID).chat_preview_enabled ?? true).toBe(before);
    expect(failed).toHaveBeenCalledTimes(1);
    window.removeEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, failed);
  });

  it("네트워크 오류도 되돌림", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const before = getUserSettings(UID).chat_push_enabled ?? true;
    await expect(updateUserSettings(UID, { chat_push_enabled: !before })).resolves.toBe(false);
    expect(getUserSettings(UID).chat_push_enabled ?? true).toBe(before);
  });

  it("keepLocal(언어): 실패해도 기기 값 유지, 실패 이벤트 없음", async () => {
    stubFetch(false);
    const failed = vi.fn();
    window.addEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, failed);
    await expect(updateUserSettings(UID, { preferred_language: "en" }, { onFailure: "keepLocal" })).resolves.toBe(false);
    expect(getUserSettings(UID).preferred_language).toBe("en");
    expect(failed).not.toHaveBeenCalled();
    window.removeEventListener(USER_SETTINGS_SAVE_FAILED_EVENT, failed);
  });
});
