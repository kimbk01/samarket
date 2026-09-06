import { describe, expect, it, vi } from "vitest";
import { applyBoostLifecycle } from "@/lib/promotion/admin-boost-lifecycle";

function mockSb(row: Record<string, unknown> | null, updateError: { message: string } | null = null) {
  const result = { error: updateError };
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    then: (
      onFulfilled: (v: typeof result) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise<unknown>;
  } = {
    eq: vi.fn(),
    in: vi.fn(),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        })),
      })),
      update: vi.fn(() => chain),
    })),
  } as never;
}

describe("applyBoostLifecycle", () => {
  it("pauses active order", async () => {
    const sb = mockSb({
      id: "o1",
      domain: "community",
      order_status: "active",
      end_at: "2099-01-01T00:00:00Z",
    });
    const res = await applyBoostLifecycle(sb, {
      orderId: "o1",
      domain: "community",
      action: "pause",
      adminUserId: "admin",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.orderStatus).toBe("paused");
  });

  it("rejects pause when not active", async () => {
    const sb = mockSb({
      id: "o1",
      domain: "trade",
      order_status: "pending_review",
      end_at: "2099-01-01T00:00:00Z",
    });
    const res = await applyBoostLifecycle(sb, {
      orderId: "o1",
      domain: "trade",
      action: "pause",
      adminUserId: "admin",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_active");
  });
});
