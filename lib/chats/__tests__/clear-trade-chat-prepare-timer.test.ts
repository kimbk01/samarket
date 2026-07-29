import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTradeChatPrepareTimer } from "@/lib/chats/clear-trade-chat-prepare-timer";

describe("clearTradeChatPrepareTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("unmount-equivalent clear → pending callback 0", () => {
    vi.useFakeTimers();
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const cb = vi.fn();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      cb();
    }, 72);
    clearTradeChatPrepareTimer(timerRef);
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(0);
    expect(timerRef.current).toBeNull();
  });

  it("dependency-change equivalent: clear then new timer → old 0, new 1", () => {
    vi.useFakeTimers();
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const oldCb = vi.fn();
    const newCb = vi.fn();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      oldCb();
    }, 72);
    clearTradeChatPrepareTimer(timerRef);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      newCb();
    }, 72);
    vi.advanceTimersByTime(72);
    expect(oldCb).toHaveBeenCalledTimes(0);
    expect(newCb).toHaveBeenCalledTimes(1);
    expect(timerRef.current).toBeNull();
  });

  it("no timer scheduled → clear is no-op", () => {
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    expect(() => clearTradeChatPrepareTimer(timerRef)).not.toThrow();
    expect(timerRef.current).toBeNull();
  });
});
