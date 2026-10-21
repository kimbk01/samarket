/**
 * 3-C IA-04 — admin pause records paused_by='admin' (owner cannot resume it); admin resume / approve clear it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const updates: Array<{ payload: Record<string, unknown>; filters: unknown[] }> = [];

vi.mock("@/lib/admin/require-admin-permission", () => ({ requireAdminPermission: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: () => undefined,
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    from: () => {
      const rec = { payload: {} as Record<string, unknown>, filters: [] as unknown[] };
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        update: (p: Record<string, unknown>) => {
          rec.payload = p;
          updates.push(rec);
          return b;
        },
        insert: async () => ({ error: null }),
        eq: (...a: unknown[]) => {
          rec.filters.push(["eq", ...a]);
          return b;
        },
        in: (...a: unknown[]) => {
          rec.filters.push(["in", ...a]);
          return b;
        },
        select: async () => ({ data: [{ id: "c1" }], error: null }),
      });
      return b;
    },
  }),
}));

import { PATCH } from "@/app/api/admin/store-coupons/route";

async function call(body: Record<string, unknown>) {
  const res = await PATCH(
    new NextRequest("https://x.test/api/admin/store-coupons", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return res.status;
}

beforeEach(() => {
  updates.length = 0;
});

describe("admin coupon transitions — paused_by", () => {
  it("pause writes paused_by admin", async () => {
    expect(await call({ id: "c1", action: "pause" })).toBe(200);
    expect(updates[0].payload).toMatchObject({ lifecycle_state: "paused", is_active: false, paused_by: "admin" });
  });

  it("resume clears paused_by", async () => {
    expect(await call({ id: "c1", action: "resume" })).toBe(200);
    expect(updates[0].payload).toMatchObject({ lifecycle_state: "active", is_active: true, paused_by: null });
  });

  it("reject leaves paused_by untouched", async () => {
    expect(await call({ id: "c1", action: "reject", reason: "policy" })).toBe(200);
    expect(updates[0].payload).not.toHaveProperty("paused_by");
  });
});
