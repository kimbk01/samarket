import { describe, expect, it, vi } from "vitest";

const clearBootstrapCache = vi.fn();
vi.mock("@/lib/community-messenger/bootstrap-cache", () => ({
  clearBootstrapCache: () => clearBootstrapCache(),
}));

import { runMessengerHomePullRefresh } from "@/lib/community-messenger/home/run-messenger-home-pull-refresh";

describe("runMessengerHomePullRefresh", () => {
  it("runs a non-silent refresh and returns its reported outcome", async () => {
    const refresh = vi.fn(async (_silent?: boolean, report?: { outcome: string }) => {
      if (report) report.outcome = "error";
    });
    await expect(runMessengerHomePullRefresh(refresh)).resolves.toBe("error");
    expect(refresh).toHaveBeenCalledWith(false, expect.any(Object));
    expect(clearBootstrapCache).toHaveBeenCalledTimes(1);
  });

  it("skipped refresh (round already in flight) → cancelled", async () => {
    await expect(runMessengerHomePullRefresh(async () => {})).resolves.toBe("cancelled");
  });
});
