import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isRouteAdmin = vi.fn();
const requireAdminPermission = vi.fn();
const requireAuthenticatedUserId = vi.fn();
const appendAdminRouteAudit = vi.fn();
const adminUpdateSupportCaseStatus = vi.fn();
const listSupportCasesForAdmin = vi.fn();
const adminUpsertSupportGuidanceEntry = vi.fn();
const sb = { from: vi.fn() };

vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => isRouteAdmin() }));
// RS-04: 케이스 조회·처리는 `support` 키 가드 (requireAdminPermission)
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (key: string) => requireAdminPermission(key),
}));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: () => requireAuthenticatedUserId(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sb }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...args: unknown[]) => appendAdminRouteAudit(...args),
}));
vi.mock("@/lib/support/support-case-service", () => ({
  adminAssignSupportCase: vi.fn(),
  adminDeleteSupportMessage: vi.fn(),
  adminEditSupportMessage: vi.fn(),
  adminReplySupportCase: vi.fn(),
  adminSetSupportCasePriority: vi.fn(),
  adminUpdateSupportCaseStatus: (...args: unknown[]) => adminUpdateSupportCaseStatus(...args),
  enrichSupportCasesForAdminDisplay: vi.fn(async (_sb: unknown, rows: unknown[]) => rows),
  listSupportCasesForAdmin: (...args: unknown[]) => listSupportCasesForAdmin(...args),
  countSupportCasesByTab: vi.fn(async () => null),
  getSupportCaseForAdmin: vi.fn(),
  listSupportMessages: vi.fn(),
  markSupportCaseNotificationsRead: vi.fn(),
  markSupportCaseReadForAdmin: vi.fn(),
  reopenSupportCase: vi.fn(),
}));
vi.mock("@/lib/support/support-guidance-service", () => ({
  adminUpsertSupportGuidanceEntry: (...args: unknown[]) => adminUpsertSupportGuidanceEntry(...args),
  listEnabledSupportGuidance: vi.fn(),
}));
vi.mock("@/lib/support/support-category-registry", () => ({
  validateSupportCategoryForOpen: () => ({ ok: true, category: "ACCOUNT", issueType: "LOGIN" }),
}));

function req(url: string, method: string, body: unknown) {
  return new NextRequest(url, { method, body: JSON.stringify(body) });
}

describe("F3 support admin writes leave an admin audit row", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [isRouteAdmin, requireAdminPermission, requireAuthenticatedUserId, appendAdminRouteAudit, adminUpdateSupportCaseStatus, adminUpsertSupportGuidanceEntry, listSupportCasesForAdmin]) {
      m.mockReset();
    }
    isRouteAdmin.mockResolvedValue(true);
    requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "admin-1" });
  });

  it("case status change audits after success", async () => {
    adminUpdateSupportCaseStatus.mockResolvedValue({ ok: true, case: { id: "c1" } });
    const { PATCH } = await import("../cases/[caseId]/route");
    const res = await PATCH(req("http://x/api/admin/support/cases/c1", "PATCH", { action: "status", status: "RESOLVED" }), {
      params: Promise.resolve({ caseId: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(requireAdminPermission).toHaveBeenCalledWith("support");
    expect(appendAdminRouteAudit).toHaveBeenCalledTimes(1);
    expect(appendAdminRouteAudit.mock.calls[0][2]).toMatchObject({
      actorId: "admin-1",
      targetType: "support_case",
      targetId: "c1",
      action: "support_case.status",
      after: { status: "RESOLVED" },
    });
  });

  it("case status failure does not audit", async () => {
    adminUpdateSupportCaseStatus.mockResolvedValue({ ok: false, error: "invalid_transition" });
    const { PATCH } = await import("../cases/[caseId]/route");
    const res = await PATCH(req("http://x/api/admin/support/cases/c1", "PATCH", { action: "status", status: "OPEN" }), {
      params: Promise.resolve({ caseId: "c1" }),
    });
    expect(res.status).toBe(400);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("guidance upsert audits create", async () => {
    adminUpsertSupportGuidanceEntry.mockResolvedValue({ ok: true, entry: { id: "g1", title: "t" } });
    const { POST } = await import("../guidance/route");
    const res = await POST(
      req("http://x/api/admin/support/guidance", "POST", { category: "ACCOUNT", issueType: "LOGIN", title: "t" })
    );
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit.mock.calls[0][2]).toMatchObject({
      targetType: "support_guidance",
      targetId: "g1",
      action: "support_guidance.create",
    });
  });
});

describe("support admin routes — final check 2026-11-28 (M6 · L6 · L12)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [requireAdminPermission, requireAuthenticatedUserId, appendAdminRouteAudit, adminUpdateSupportCaseStatus, listSupportCasesForAdmin]) {
      m.mockReset();
    }
    requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "admin-1" });
  });
  const patch = async (body: unknown) => {
    const { PATCH } = await import("../cases/[caseId]/route");
    return PATCH(req("http://x/api/admin/support/cases/c1", "PATCH", body), { params: Promise.resolve({ caseId: "c1" }) });
  };

  it("M6: 「상담 종료」 passes the seen last-message time; a bad value is 400 without touching the case", async () => {
    adminUpdateSupportCaseStatus.mockResolvedValue({ ok: true, case: { id: "c1" } });
    const ok = await patch({ action: "status", status: "RESOLVED", seenLastMessageAt: "2026-12-01T00:00:00.000Z" });
    expect(ok.status).toBe(200);
    // 고치기 전: 본 시각을 서비스에 넘기지 않았다
    expect(adminUpdateSupportCaseStatus.mock.calls[0][1]).toMatchObject({ status: "RESOLVED", seenLastMessageAt: "2026-12-01T00:00:00.000Z" });
    const bad = await patch({ action: "status", status: "RESOLVED", seenLastMessageAt: "not-a-time" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: "invalid_seen_last_message_at" });
    expect(adminUpdateSupportCaseStatus).toHaveBeenCalledTimes(1);
    const none = await patch({ action: "status", status: "RESOLVED" });
    expect(none.status).toBe(200);
    expect(adminUpdateSupportCaseStatus.mock.calls[1][1]).toMatchObject({ seenLastMessageAt: null });
  });

  it("M6: a customer message after the seen time → 409 case_updated (no audit)", async () => {
    adminUpdateSupportCaseStatus.mockResolvedValue({ ok: false, error: "case_updated" });
    const res = await patch({ action: "status", status: "RESOLVED", seenLastMessageAt: "2026-12-01T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "case_updated" });
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("L6: the queue with assignee=ME uses the permission check's admin id (no second auth call)", async () => {
    listSupportCasesForAdmin.mockResolvedValue({ ok: true, cases: [], total: 0, limit: 50, offset: 0 });
    const { GET } = await import("../cases/route");
    const res = await GET(new NextRequest("http://x/api/admin/support/cases?assignee=ME"));
    expect(res.status).toBe(200);
    // 고치기 전: requireAuthenticatedUserId 를 한 번 더 불렀다
    expect(requireAuthenticatedUserId).not.toHaveBeenCalled();
    expect(listSupportCasesForAdmin.mock.calls[0][1]).toMatchObject({ assignee: "ME", adminUserId: "admin-1" });
  });

  it("L12: the queue route has no POST (405 stub gone) and the unused summary route is gone", async () => {
    const mod = (await import("../cases/route")) as Record<string, unknown>;
    expect(mod.POST).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
    expect(existsSync(join(process.cwd(), "app/api/admin/support/summary/route.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app/api/admin/support/summary"))).toBe(false);
  });
});

