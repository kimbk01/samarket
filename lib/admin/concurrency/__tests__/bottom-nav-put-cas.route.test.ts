import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from "./fake-supabase-query";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeSupabase((c) => handler(c));
const appendAdminRouteAudit = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: {} }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/delivery/load-delivery-bottom-nav-items-server", () => ({
  DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG: "delivery-bottom-nav",
}));
vi.mock("next/cache", () => ({ revalidateTag: () => undefined }));

import { PUT } from "@/app/api/admin/stores/bottom-nav/route";

const LOADED = "2026-10-19T01:00:00.123456+00:00";
const item = { id: "n-1", label: "홈", is_center: false, updated_at: LOADED };

function call(body: Record<string, unknown>) {
  return PUT(
    new Request("https://x.test/api/admin/stores/bottom-nav", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
});

describe("bottom nav item PUT — CAS", () => {
  it("400 expected_updated_at_required without version", async () => {
    handler = () => ({ data: item, error: null });
    const res = await call({ id: "n-1", label: "새 홈" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls).toHaveLength(0);
  });

  it("409 stale_updated_at when the item changed after load (no center clearing)", async () => {
    handler = (c) => (c.op === "select" ? { data: { ...item, updated_at: "2026-10-19T02:00:00Z" }, error: null } : { data: [], error: null });
    const res = await call({ id: "n-1", is_center: true, expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_updated_at");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 when the conditional UPDATE matches 0 rows and restores the cleared center", async () => {
    handler = (c) => {
      if (c.op === "select") return { data: item, error: null };
      if (c.op === "update" && filterValue(c, "eq", "is_center") === true) return { data: [{ id: "n-9" }], error: null };
      return { data: null, error: null };
    };
    const res = await call({ id: "n-1", is_center: true, expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    const cas = fake.calls.find((c) => c.op === "update" && filterValue(c, "eq", "updated_at") !== undefined)!;
    expect(filterValue(cas, "eq", "updated_at")).toBe(LOADED);
    const restore = fake.calls.find((c) => c.op === "update" && filterValue(c, "in", "id") !== undefined)!;
    expect(restore.values).toEqual({ is_center: true });
    expect(filterValue(restore, "in", "id")).toEqual(["n-9"]);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("normal save succeeds and writes the audit row with before", async () => {
    handler = (c) => (c.op === "select" ? { data: item, error: null } : { data: { ...item, label: "새 홈" }, error: null });
    const res = await call({ id: "n-1", label: "새 홈", expected_updated_at: LOADED });
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: "delivery_bottom_nav.update", before: item })
    );
  });
});
