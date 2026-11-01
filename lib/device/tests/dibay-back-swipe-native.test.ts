import { afterEach, describe, expect, it, vi } from "vitest";

const setEnabled = vi.fn(() => Promise.resolve({}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ setEnabled }) }));
const platform = { value: "ios" as string | null };
vi.mock("@/lib/platform/capacitor-native", () => ({ resolveCapacitorShellPlatform: () => platform.value }));

describe("setDibayBackSwipeEnabled — iOS 앱에서만, 플러그인 없는 예전 앱은 아무 일 없음", () => {
  afterEach(() => {
    setEnabled.mockClear();
    vi.unstubAllGlobals();
  });

  it("iOS + 플러그인 있음 → 호출", async () => {
    vi.stubGlobal("window", { Capacitor: { PluginHeaders: [{ name: "DibayBackSwipe" }] } });
    const { setDibayBackSwipeEnabled } = await import("@/lib/device/dibay-back-swipe-native");
    platform.value = "ios";
    await expect(setDibayBackSwipeEnabled(true)).resolves.toBe(true);
    expect(setEnabled).toHaveBeenCalledWith({ enabled: true });
  });

  it("예전 iOS 앱(플러그인 없음)·Android·웹 → 호출 안 함", async () => {
    const { setDibayBackSwipeEnabled } = await import("@/lib/device/dibay-back-swipe-native");
    vi.stubGlobal("window", { Capacitor: { PluginHeaders: [{ name: "Other" }] } });
    platform.value = "ios";
    await expect(setDibayBackSwipeEnabled(true)).resolves.toBe(false);
    vi.stubGlobal("window", {});
    platform.value = "android";
    await expect(setDibayBackSwipeEnabled(true)).resolves.toBe(false);
    platform.value = null;
    await expect(setDibayBackSwipeEnabled(true)).resolves.toBe(false);
    expect(setEnabled).not.toHaveBeenCalled();
  });
});
