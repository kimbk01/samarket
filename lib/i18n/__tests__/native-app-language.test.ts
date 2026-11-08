// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn(async () => ({}));
let shell: string = "web";
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ set: setMock }) }));
vi.mock("@/lib/platform/capacitor-native", () => ({ resolveCapacitorShellPlatform: () => shell }));

describe("S8-1 setNativeAppLanguage — 저장 통로 (구 앱·웹은 조용히 생략)", () => {
  afterEach(() => {
    setMock.mockClear();
    shell = "web";
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it("웹에서는 호출하지 않는다", async () => {
    const { setNativeAppLanguage } = await import("@/lib/i18n/native-app-language");
    expect(await setNativeAppLanguage("en")).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("구 앱(플러그인 목록에 없음)에서는 호출하지 않는다", async () => {
    shell = "android";
    (window as unknown as { Capacitor: unknown }).Capacitor = { PluginHeaders: [{ name: "DibayDeviceClass" }] };
    const { setNativeAppLanguage } = await import("@/lib/i18n/native-app-language");
    expect(await setNativeAppLanguage("en")).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("새 앱에서는 값(ko·en·null)을 그대로 보낸다", async () => {
    shell = "ios";
    (window as unknown as { Capacitor: unknown }).Capacitor = { PluginHeaders: [{ name: "DibayAppLanguage" }] };
    const { setNativeAppLanguage } = await import("@/lib/i18n/native-app-language");
    expect(await setNativeAppLanguage("ko")).toBe(true);
    expect(await setNativeAppLanguage(null)).toBe(true);
    expect(setMock.mock.calls).toEqual([[{ language: "ko" }], [{ language: null }]]);
  });

  it("네이티브 오류는 삼킨다(throw 하지 않음)", async () => {
    shell = "android";
    setMock.mockRejectedValueOnce(new Error("not implemented"));
    const { setNativeAppLanguage } = await import("@/lib/i18n/native-app-language");
    expect(await setNativeAppLanguage("en")).toBe(false);
  });
});
