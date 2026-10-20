import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isRouteAdmin = vi.fn();
const requireAuthenticatedUserId = vi.fn();
const appendAdminRouteAudit = vi.fn();
const adminUpdateSupportCaseStatus = vi.fn();
const adminUpsertSupportGuidanceEntry = vi.fn();
const sb = { from: vi.fn() };

vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => isRouteAdmin() }));
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
  enrichSupportCasesForAdminDisplay: vi.fn(),
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
    for (const m of [isRouteAdmin, requireAuthenticatedUserId, appendAdminRouteAudit, adminUpdateSupportCaseStatus, adminUpsertSupportGuidanceEntry]) {
      m.mockReset();
    }
    isRouteAdmin.mockResolvedValue(true);
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: "admin-1" });
  });

  it("case status change audits after success", async () => {
    adminUpdateSupportCaseStatus.mockResolvedValue({ ok: true, case: { id: "c1" } });
    const { PATCH } = await import("../cases/[caseId]/route");
    const res = await PATCH(req("http://x/api/admin/support/cases/c1", "PATCH", { action: "status", status: "RESOLVED" }), {
      params: Promise.resolve({ caseId: "c1" }),
    });
    expect(res.status).toBe(200);
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
