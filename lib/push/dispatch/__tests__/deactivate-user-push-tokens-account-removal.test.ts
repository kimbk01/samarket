import { describe, expect, it, vi } from "vitest";
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";

/**
 * WP-13 NEW-09: withdrawal/purge must deactivate the user's push tokens.
 * Verifies both token tables are flipped is_active=false by user_id (non-destructive,
 * policy-independent) using existing deactivation authority.
 */
function mockSvc(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    then: (resolve: (v: typeof result) => unknown) => unknown;
  } = {
    eq: vi.fn(() => chain),
    then: (resolve) => resolve(result),
  };
  const update = vi.fn(() => chain);
  const from = vi.fn(() => ({ update }));
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
    const tables = svc.from.mock.calls.map((c) => c[0]);
    expect(tables).toEqual(expect.arrayContaining(["user_devices", "web_push_subscriptions"]));
    expect(svc.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    const eqKeys = svc.chain.eq.mock.calls.map((c) => c[0]);
    expect(eqKeys).toContain("user_id");
  });

  it("records (does not throw) a web_push_subscriptions error", async () => {
    const svc = mockSvc({ data: null, error: { message: "db down" } });
    const res = await deactivateAllUserPushTokensForAccountRemoval(svc as never, "user-2");
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("web_push_subscriptions"))).toBe(true);
  });
});
