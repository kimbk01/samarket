import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  markStoreDetailListSeedPass1Visible,
  resetStoreDetailSeedPatchTraceForTests,
  traceStoreDetailSeedSummaryPatch,
} from "@/lib/dibay/store-detail-seed-patch-trace";

function mockSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: () => null,
    length: store.size,
    clear: () => store.clear(),
  });
  return store;
}

describe("store-detail-seed-patch-trace", () => {
  beforeEach(() => {
    mockSessionStorage();
    resetStoreDetailSeedPatchTraceForTests();
  });

  it("keeps pass1 marker until summary patch (wall-clock TTL)", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    markStoreDetailListSeedPass1Visible("test-store");
    vi.spyOn(Date, "now").mockReturnValue(now + 120);
    const traced = traceStoreDetailSeedSummaryPatch("test-store");
    expect(traced.pass1_to_summary_ms).toBe(120);
  });
});
