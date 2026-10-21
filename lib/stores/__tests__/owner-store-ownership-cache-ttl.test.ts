/**
 * P2-7 (SV-07) — 소유자 제거 후 다른 인스턴스의 stale ownership 읽기 창 ≤ 5s.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getStoreIfOwner = vi.fn();
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: (...args: unknown[]) => getStoreIfOwner(...args),
}));

describe("owner store ownership cache TTL (P2-7)", () => {
  afterEach(() => vi.useRealTimers());

  it("removed owner loses cached access after ≤5s (re-queries ownership)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
    const m = await import("@/lib/stores/owner-store-ownership-cache");
    expect(m.OWNER_STORE_OWNERSHIP_TTL_MS).toBeLessThanOrEqual(5_000);
    getStoreIfOwner.mockResolvedValueOnce({ ok: true, store: { id: "s1", owner_user_id: "u1" } });
    expect((await m.getCachedStoreIfOwner({} as never, "u1", "s1")).ok).toBe(true);
    getStoreIfOwner.mockResolvedValueOnce({ ok: false, status: 403, error: "forbidden" });
    vi.advanceTimersByTime(m.OWNER_STORE_OWNERSHIP_TTL_MS + 1);
    const after = await m.getCachedStoreIfOwner({} as never, "u1", "s1");
    expect(after.ok).toBe(false);
    expect(getStoreIfOwner).toHaveBeenCalledTimes(2);
  });
});
