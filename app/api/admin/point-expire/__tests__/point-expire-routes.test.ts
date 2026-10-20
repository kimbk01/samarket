import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireSuperAdmin = vi.fn();
const requireAdminPermission = vi.fn();
const appendAdminRouteAudit = vi.fn();
const rpc = vi.fn();
const simulatePointExpireDb = vi.fn();
const updatePointExpirePolicyDb = vi.fn();
const beforeRow = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/points/point-expire-db", async (orig) => {
  const real = await orig<typeof import("@/lib/points/point-expire-db")>();
  return {
    ...real,
    simulatePointExpireDb: (...a: unknown[]) => simulatePointExpireDb(...a),
    updatePointExpirePolicyDb: (...a: unknown[]) => updatePointExpirePolicyDb(...a),
  };
});

const sb = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: () => beforeRow() };
    return q;
  },
};

import { POST as runPOST } from "@/app/api/admin/point-expire/run/route";
import { POST as simulatePOST } from "@/app/api/admin/point-expire/simulate/route";
import { PATCH as policyPATCH } from "@/app/api/admin/point-expire/policy/[id]/route";

function req(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function manilaToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  const gate = { ok: true, sb, actor: { userId: "admin-1", profile: { nickname: "운영자" } } };
  requireSuperAdmin.mockResolvedValue(gate);
  requireAdminPermission.mockResolvedValue(gate);
});

describe("POST /api/admin/point-expire/run (V3-06)", () => {
  it("rejects non super admin", async () => {
    requireSuperAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "super_admin_only" }, { status: 403 }),
    });
    const res = await runPOST(req("https://x.test/run", { asOfDate: "2026-01-01" }));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the atomic RPC once with Manila today by default and audits the outcome", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, executionIds: ["e1", "e2"], totalExpired: 300, skippedUsers: 1 },
      error: null,
    });
    const res = await runPOST(req("https://x.test/run", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, executionIds: ["e1", "e2"], totalExpired: 300, skippedUsers: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_run_point_expire", {
      p_as_of_date: manilaToday(),
      p_actor_id: "admin-1",
      p_actor_nickname: "운영자",
    });
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      sb,
      expect.anything(),
      expect.objectContaining({ action: "point_expire.run", targetId: manilaToday() })
    );
  });

  it("rejects a future as-of date without calling the RPC", async () => {
    const res = await runPOST(req("https://x.test/run", { asOfDate: "2999-01-01" }));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC failure without auditing", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "forbidden" }, error: null });
    const res = await runPOST(req("https://x.test/run", { asOfDate: "2026-01-01" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("forbidden");
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/point-expire/simulate", () => {
  it("defaults the as-of date to Manila today", async () => {
    simulatePointExpireDb.mockResolvedValue(null);
    await simulatePOST(req("https://x.test/simulate", {}));
    expect(simulatePointExpireDb).toHaveBeenCalledWith(sb, manilaToday());
  });
});

describe("PATCH /api/admin/point-expire/policy/[id]", () => {
  it("audits before/after", async () => {
    beforeRow.mockResolvedValue({ data: { id: "p1", expire_after_days: 30 }, error: null });
    updatePointExpirePolicyDb.mockResolvedValue({ id: "p1", expireAfterDays: 60 });
    const res = await policyPATCH(req("https://x.test/policy/p1", { expireAfterDays: 60 }, "PATCH"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      sb,
      expect.anything(),
      expect.objectContaining({
        action: "point_expire_policy.update",
        targetId: "p1",
        before: { id: "p1", expire_after_days: 30 },
        after: { patch: { expireAfterDays: 60 }, policy: { id: "p1", expireAfterDays: 60 } },
      })
    );
  });
});
