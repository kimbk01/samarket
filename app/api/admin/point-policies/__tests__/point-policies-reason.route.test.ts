import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const requireAdminPermission = vi.fn();
const appendCommunityAdminAudit = vi.fn();
const db = {
  addPointPolicyLogDb: vi.fn(),
  saveBoardPointPolicyDb: vi.fn(),
  setBoardPointPolicyActiveDb: vi.fn(),
  savePointEventPolicyDb: vi.fn(),
  setPointEventPolicyActiveDb: vi.fn(),
  saveProbabilityRuleDb: vi.fn(),
  deleteProbabilityRuleDb: vi.fn(),
  listBoardPointPolicies: vi.fn(),
  listPointEventPolicies: vi.fn(),
  listProbabilityRulesByPolicyId: vi.fn(),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...args: unknown[]) => requireAdminPermission(...args),
}));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...args: unknown[]) => appendCommunityAdminAudit(...args),
}));
vi.mock("@/lib/points/point-policy-db", () => db);

const BEFORE_ROW = { id: "bp-1", board_key: "general", is_active: true };

function makeSb() {
  const maybeSingle = vi.fn(async () => ({ data: BEFORE_ROW, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from };
}

function jsonReq(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE = "https://samarket.vercel.app/api/admin/point-policies";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("common point policy mutations — admin reason required + audit", () => {
  let sb: ReturnType<typeof makeSb>;

  beforeEach(() => {
    vi.clearAllMocks();
    sb = makeSb();
    requireAdminPermission.mockResolvedValue({
      ok: true,
      sb,
      actor: { userId: "admin-1", profile: { nickname: "ops" } },
    });
    appendCommunityAdminAudit.mockResolvedValue({ ok: true });
    db.addPointPolicyLogDb.mockResolvedValue({});
    db.saveBoardPointPolicyDb.mockResolvedValue({ id: "bp-1", boardKey: "general", isActive: true });
    db.setBoardPointPolicyActiveDb.mockResolvedValue({ id: "bp-1", isActive: false });
    db.savePointEventPolicyDb.mockResolvedValue({ id: "ev-1", title: "x" });
    db.setPointEventPolicyActiveDb.mockResolvedValue({ id: "ev-1", isActive: true });
    db.saveProbabilityRuleDb.mockResolvedValue({ id: "ppr-1" });
    db.deleteProbabilityRuleDb.mockResolvedValue(undefined);
  });

  const writes = () =>
    [
      db.saveBoardPointPolicyDb,
      db.setBoardPointPolicyActiveDb,
      db.savePointEventPolicyDb,
      db.setPointEventPolicyActiveDb,
      db.saveProbabilityRuleDb,
      db.deleteProbabilityRuleDb,
      db.addPointPolicyLogDb,
      appendCommunityAdminAudit,
    ].reduce((n, f) => n + f.mock.calls.length, 0);

  it.each([undefined, "", " a ", 42])("board POST: reason %p → 400 reason_required, no DB write", async (reason) => {
    const { POST } = await import("@/app/api/admin/point-policies/board/route");
    const res = await POST(jsonReq(`${BASE}/board`, "POST", { id: "bp-1", boardKey: "general", reason }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "reason_required" });
    expect(writes()).toBe(0);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("board active PATCH / event POST / probability POST without reason → 400, no DB write", async () => {
    const active = await import("@/app/api/admin/point-policies/board/[id]/active/route");
    const event = await import("@/app/api/admin/point-policies/event/route");
    const prob = await import("@/app/api/admin/point-policies/probability/route");
    const responses = [
      await active.PATCH(jsonReq(`${BASE}/board/bp-1/active`, "PATCH", { isActive: false }), params("bp-1")),
      await event.POST(jsonReq(`${BASE}/event`, "POST", { setActive: { id: "ev-1", isActive: true } })),
      await event.POST(jsonReq(`${BASE}/event`, "POST", { title: "x" })),
      await prob.POST(jsonReq(`${BASE}/probability`, "POST", { deleteId: "ppr-1" })),
      await prob.POST(jsonReq(`${BASE}/probability`, "POST", { policyId: "bp-1" })),
    ];
    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "reason_required" });
    }
    expect(writes()).toBe(0);
  });

  it("board POST success writes audit with before/after + trimmed reason, and the policy log carries the reason", async () => {
    const { POST } = await import("@/app/api/admin/point-policies/board/route");
    const res = await POST(
      jsonReq(`${BASE}/board`, "POST", { id: "bp-1", boardKey: "general", reason: "  보상 조정  " })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.audit_warning).toBeUndefined();
    expect(db.saveBoardPointPolicyDb).toHaveBeenCalledWith(sb, { id: "bp-1", boardKey: "general" });
    expect(appendCommunityAdminAudit).toHaveBeenCalledTimes(1);
    expect(appendCommunityAdminAudit.mock.calls[0][2]).toMatchObject({
      actorId: "admin-1",
      targetType: "community_point_policy",
      targetId: "bp-1",
      action: "community_point_policy.update",
      reason: "보상 조정",
      before: BEFORE_ROW,
      after: { id: "bp-1", boardKey: "general", isActive: true },
    });
    expect(db.addPointPolicyLogDb.mock.calls[0][1].note).toContain("보상 조정");
  });

  it("board active PATCH success audits activate/deactivate with reason", async () => {
    const { PATCH } = await import("@/app/api/admin/point-policies/board/[id]/active/route");
    const res = await PATCH(
      jsonReq(`${BASE}/board/bp-1/active`, "PATCH", { isActive: false, reason: "운영 중지" }),
      params("bp-1")
    );
    expect(res.status).toBe(200);
    expect(appendCommunityAdminAudit.mock.calls[0][2]).toMatchObject({
      action: "community_point_policy.deactivate",
      targetId: "bp-1",
      reason: "운영 중지",
      before: BEFORE_ROW,
      after: { id: "bp-1", isActive: false },
    });
  });

  it("event + probability success paths audit with reason", async () => {
    const event = await import("@/app/api/admin/point-policies/event/route");
    const prob = await import("@/app/api/admin/point-policies/probability/route");
    await event.POST(jsonReq(`${BASE}/event`, "POST", { setActive: { id: "ev-1", isActive: true }, reason: "이벤트 시작" }));
    await prob.POST(jsonReq(`${BASE}/probability`, "POST", { deleteId: "ppr-1", reason: "규칙 정리" }));
    const actions = appendCommunityAdminAudit.mock.calls.map((c) => [c[2].action, c[2].reason]);
    expect(actions).toEqual([
      ["point_event_policy.activate", "이벤트 시작"],
      ["point_probability_rule.delete", "규칙 정리"],
    ]);
  });

  it("audit write failure is reported (audit_warning), not silently passed", async () => {
    appendCommunityAdminAudit.mockResolvedValue({ ok: false, error: "boom" });
    const { POST } = await import("@/app/api/admin/point-policies/board/route");
    const res = await POST(jsonReq(`${BASE}/board`, "POST", { boardKey: "general", reason: "신규 정책" }));
    expect(res.status).toBe(200);
    expect((await res.json()).audit_warning).toBe("audit_failed");
  });
});

describe("common point policy callers send the admin reason", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  it("AdminPointPolicyPage + AdminCommunityPointPoliciesPage confirm with reason and show server codes", () => {
    for (const rel of [
      "components/admin/point-policies/AdminPointPolicyPage.tsx",
      "components/admin/community/AdminCommunityPointPoliciesPage.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("confirmAdminAction");
      expect(src).toContain("reason: c.reason");
      expect(src).toContain("AdminResultBanner");
      expect(src).toContain("json.error ||");
      expect(src).toContain("audit_warning");
    }
  });
});
