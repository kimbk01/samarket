import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from "./fake-supabase-query";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeSupabase((c) => handler(c));
const auditAdminFeePolicyWrite = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: {} }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/commission/admin-fee-policy-guards", () => ({
  assertDefaultFeePolicyRemainsAfterDeactivate: async () => ({ ok: true }),
  auditAdminFeePolicyWrite: (...a: unknown[]) => auditAdminFeePolicyWrite(...a),
}));

import { PATCH } from "@/app/api/admin/store-fee-policies/[id]/route";

const LOADED = "2026-10-19T01:00:00.123456+00:00";
const current = {
  id: "pol-1",
  store_id: "store-1",
  category_id: null,
  topic_id: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  priority: 10,
  is_archived: false,
  updated_at: LOADED,
};

function call(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/admin/store-fee-policies/pol-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: "pol-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
});

describe("store fee policy PATCH — 매장 허브 개별 수수료 CAS", () => {
  it("400 expected_updated_at_required when the client omits the version", async () => {
    handler = (c) => (c.op === "select" ? { data: current, error: null } : { data: null, error: null });
    const res = await call({ fee_percent: 12, is_active: true });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 stale_policy when the policy changed after the screen loaded", async () => {
    handler = (c) =>
      c.op === "select" ? { data: { ...current, updated_at: "2026-10-19T02:00:00+00:00" }, error: null } : { data: null, error: null };
    const res = await call({ fee_percent: 12, expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_policy");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    expect(auditAdminFeePolicyWrite).not.toHaveBeenCalled();
  });

  it("409 stale_policy when the conditional UPDATE matches 0 rows (race)", async () => {
    handler = (c) => {
      if (c.op === "select" && c.terminal === "maybeSingle") return { data: current, error: null };
      if (c.op === "select") return { data: [], error: null };
      return { data: null, error: null };
    };
    const res = await call({ fee_percent: 12, expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_policy");
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect(auditAdminFeePolicyWrite).not.toHaveBeenCalled();
  });

  it("normal save succeeds and keeps the audit write", async () => {
    handler = (c) => {
      if (c.op === "select" && c.terminal === "maybeSingle") return { data: current, error: null };
      if (c.op === "select") return { data: [], error: null };
      return { data: { id: "pol-1" }, error: null };
    };
    const res = await call({ fee_percent: 12, expected_updated_at: "2026-10-19T01:00:00.123456Z" });
    expect(res.status).toBe(200);
    expect(auditAdminFeePolicyWrite).toHaveBeenCalledTimes(1);
  });
});
