/** @vitest-environment jsdom */
/** 언어 SSOT S8-6 — 기기 앱 언어 기록: 같은 값 재전송 없음, 기기 행 없으면 기억하지 않음, 실패해도 throw 없음 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client-instance-id", () => ({ ensureClientInstanceId: () => "dev-1" }));

import {
  DEVICE_APP_LANGUAGE_REPORTED_KEY,
  reportDeviceAppLanguage,
  resetDeviceAppLanguageReportForTests,
} from "@/lib/i18n/report-device-app-language";

function mockFetch(updated: number, ok = true) {
  const fn = vi.fn(async () => ({ ok, json: async () => ({ ok, updated }) }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("reportDeviceAppLanguage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDeviceAppLanguageReportForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("비로그인 → 보내지 않음", async () => {
    const f = mockFetch(1);
    expect(await reportDeviceAppLanguage(null, "en")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("기록 성공 → 같은 값은 다시 보내지 않음, 값이 바뀌면 보냄", async () => {
    const f = mockFetch(1);
    expect(await reportDeviceAppLanguage("u1", "en")).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/me/devices/app-language");
    expect(JSON.parse(init.body)).toEqual({ device_id: "dev-1", language: "en" });
    expect(window.localStorage.getItem(DEVICE_APP_LANGUAGE_REPORTED_KEY)).toBe("u1|dev-1|en");
    expect(await reportDeviceAppLanguage("u1", "en")).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
    expect(await reportDeviceAppLanguage("u1", "ko")).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("기기 행 없음(updated 0) → 기억하지 않고 1분 뒤 다시", async () => {
    const f = mockFetch(0);
    let t = 1_000;
    expect(await reportDeviceAppLanguage("u1", "ko", () => t)).toBe(false);
    expect(window.localStorage.getItem(DEVICE_APP_LANGUAGE_REPORTED_KEY)).toBeNull();
    t += 30_000;
    await reportDeviceAppLanguage("u1", "ko", () => t);
    expect(f).toHaveBeenCalledTimes(1);
    t += 31_000;
    await reportDeviceAppLanguage("u1", "ko", () => t);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("네트워크 오류 → false, throw 없음", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(reportDeviceAppLanguage("u1", "en")).resolves.toBe(false);
  });
});
