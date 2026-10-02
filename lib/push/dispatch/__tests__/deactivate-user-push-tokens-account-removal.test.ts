import { describe, expect, it, vi } from "vitest";
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";

/**
 * WP-13 NEW-09: withdrawal/purge must deactivate the user's push tokens.
 * Verifies both token tables are flipped is_active=false by user_id (non-destructive,
 * policy-independent) using existing deactivation authority.
 */
type MockResult = { data: unknown; error: unknown };
type Chain = {
  eq: ReturnType<typeof vi.fn>;
  then: (resolve: (v: MockResult) => unknown) => unknown;
};

function mockSvc(result: MockResult = { data: null, error: null }) {
  const chain = {} as Chain;
  chain.eq = vi.fn((_column: string, _value?: unknown) => chain);
  chain.then = (resolve) => resolve(result);
  const update = vi.fn((_patch: Record<string, unknown>) => chain);
  const from = vi.fn((_table: string) => ({ update }));
  return { from, update, chain };
}

describe("deactivateAllUserPushTokensForAccountRemoval (NEW-09)", () => {
  it("rejects empty user id without touching DB", async () => {
    const svc = mockSvc();
    const res = await deactivateAllUserPushTokensForAccountRemoval(svc as never, "  ");
    expect(res).toEqual({ ok: false, errors: ["invalid_user_id"] });
    expect(svc.from).not.toHaveBeenCalled();
  });

  it("deactivates user_devices AND web_push_subscriptions by user_id (is_active=false)", async () => {
    const svc = mockSvc({ data: null, error: null });
    const res = await deactivateAllUserPushTokensForAccountRemoval(svc as never, "user-1");
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(svc.from).toHaveBeenCalledWith("user_devices");
    expect(svc.from).toHaveBeenCalledWith("web_push_subscriptions");
    expect(svc.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    expect(svc.chain.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("records (does not throw) a web_push_subscriptions error", async () => {
    const svc = mockSvc({ data: null, error: { message: "db down" } });
    const res = await deactivateAllUserPushTokensForAccountRemoval(svc as never, "user-2");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("web_push_subscriptions"))).toBe(true);
  });
});
