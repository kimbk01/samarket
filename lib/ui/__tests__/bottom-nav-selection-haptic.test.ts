/**
 * 하단 탭 선택 햅틱 S4 (2026-11-15) — 네이티브 플러그인이 있으면 start→changed→end, 없으면 웹 진동.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    selectionStart: vi.fn(async () => void calls.push("start")),
    selectionChanged: vi.fn(async () => void calls.push("changed")),
    selectionEnd: vi.fn(async () => void calls.push("end")),
  },
}));

type CapWin = Window & { Capacitor?: unknown };

beforeEach(() => {
  calls.length = 0;
  vi.resetModules();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn(() => true) });
});
afterEach(() => {
  delete (window as CapWin).Capacitor;
});

describe("triggerBottomNavSelectionFeedback", () => {
  it("네이티브 플러그인 있음 — 미리 불러 두면 start→changed→end, 웹 진동 없음", async () => {
    (window as CapWin).Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n: string) => n === "Haptics" };
    const m = await import("@/lib/ui/light-tap-feedback");
    m.prewarmBottomNavHaptics();
    await new Promise((r) => setTimeout(r, 0));
    m.triggerBottomNavSelectionFeedback();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["start", "changed", "end"]);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it("플러그인 없는 설치본(S4 이전)·웹 — 웹 진동 10ms", async () => {
    (window as CapWin).Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => false };
    const m = await import("@/lib/ui/light-tap-feedback");
    m.triggerBottomNavSelectionFeedback();
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
    expect(calls).toEqual([]);
  });
});
