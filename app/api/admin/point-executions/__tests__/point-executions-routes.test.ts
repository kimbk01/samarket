import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSuperAdmin = vi.fn();
const requireAdminPermission = vi.fn();
const appendAdminRouteAudit = vi.fn();
const executePointRewardServer = vi.fn();
const updatePointReclaimPolicyDb = vi.fn();
const beforeRow = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireSuperAdmin: (...a: unknown[]) => requireSuperAdmin(...a),
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/point-executions/execute-point-reward-server", () => ({
  executePointRewardServer: (...a: unknown[]) => executePointRewardServer(...a),
}));
vi.mock("@/lib/points/point-execution-db", () => ({
  updatePointReclaimPolicyDb: (...a: unknown[]) => updatePointReclaimPolicyDb(...a),
}));

const sb = {
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: () => beforeRow() };
    return q;
  },
};

import { POST as rewardPOST } from "@/app/api/admin/point-executions/reward/route";
import { PATCH as reclaimPATCH } from "@/app/api/admin/point-executions/reclaim/[id]/route";

function req(body: unknown, method = "POST") {
  return new Request("https://x.test/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  const gate = { ok: true, sb, actor: { userId: "admin-1", profile: { nickname: "운영자" } } };
  requireSuperAdmin.mockResolvedValue(gate);
  requireAdminPermission.mockResolvedValue(gate);
});

describe("POST /api/admin/point-executions/reward (V3-07)", () => {
  it.each([[undefined], [""], ["a"], ["  b  "]])("requires reason ≥ 2 chars (%j)", async (reason) => {
    const res = await rewardPOST(req({ userId: "u1", reason }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    expect(executePointRewardServer).not.toHaveBeenCalled();
  });

  it("passes reason + confirmed point to the writer and the audit", async () => {
    executePointRewardServer.mockResolvedValue({ id: "ex1", status: "success", finalPoint: 10 });
    const res = await rewardPOST(
      req({ userId: "u1", userNickname: "철수", reason: " 이벤트 보상 ", confirmedPoint: 10 })
    );
    expect(res.status).toBe(200);
    expect(executePointRewardServer).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ userId: "u1", reason: "이벤트 보상", confirmedMaxPoint: 10 })
    );
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      sb,
      expect.anything(),
      expect.objectContaining({
        action: "point_execution.reward",
        after: expect.objectContaining({
          input: expect.objectContaining({ reason: "이벤트 보상", confirmedMaxPoint: 10 }),
        }),
      })
    );
  });

  it("rejects an invalid confirmed point", async () => {
    const res = await rewardPOST(req({ userId: "u1", reason: "사유", confirmedPoint: -1 }));
    expect(res.status).toBe(400);
    expect(executePointRewardServer).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/point-executions/reclaim/[id]", () => {
  it("audits before/after", async () => {
    beforeRow.mockResolvedValue({ data: { id: "r1", is_active: true }, error: null });
    updatePointReclaimPolicyDb.mockResolvedValue({ id: "r1", isActive: false });
    const res = await reclaimPATCH(req({ isActive: false }, "PATCH"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      sb,
      expect.anything(),
      expect.objectContaining({
        action: "point_reclaim_policy.update",
        targetId: "r1",
        before: { id: "r1", is_active: true },
        after: { patch: { isActive: false }, policy: { id: "r1", isActive: false } },
      })
    );
  });
});
