import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";
import {
  addMypagePullRefreshHandler,
  getMypagePullRefreshSnapshot,
  patchMypagePullRefresh,
  runMypagePullRefresh,
} from "@/lib/mypage/mypage-pull-refresh-store";

vi.mock("@/lib/layout/main-hub-ptr-preflight", () => ({
  preflightMainHubPtrRefresh: vi.fn(),
}));

describe("runMypagePullRefresh", () => {
  beforeEach(() => {
    stubVitestMinimalWindow({
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as typeof setTimeout,
      requestAnimationFrame: (fn: FrameRequestCallback) => {
        fn(0);
        return 0;
      },
    });
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
    patchMypagePullRefresh({ pullPx: 0, refreshing: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    patchMypagePullRefresh({ pullPx: 0, refreshing: false });
  });

  it("no-ops without registered handlers", async () => {
    await runMypagePullRefresh(60);
    expect(getMypagePullRefreshSnapshot().refreshing).toBe(false);
  });

  it("runs registered handler then resets", async () => {
    const handler = vi.fn(async () => undefined);
    const remove = addMypagePullRefreshHandler(handler);
    try {
      await runMypagePullRefresh(60);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(getMypagePullRefreshSnapshot().refreshing).toBe(false);
      expect(getMypagePullRefreshSnapshot().pullPx).toBe(0);
    } finally {
      remove();
    }
  });
});
