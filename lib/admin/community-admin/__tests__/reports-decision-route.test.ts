import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/admin/concurrency/__tests__/fake-supabase-query";
import {
  resolveCommunityReportPatchTransition,
  resolveMeetingReportTransition,
} from "@/lib/admin/community-admin/community-report-transitions";
import { parseCommunitySanctionInput } from "@/lib/admin/community-admin/community-sanction-input";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeSupabase((c) => handler(c));
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpc = vi.fn(async () => rpcResult);
const sb = { ...fake.sb, rpc };
let isSuperAdmin = false;
let serviceClient: unknown = sb;

const audit = vi.fn(async () => ({ ok: true }));
const reclaim = vi.fn(async () => undefined);
const notifyContent = vi.fn(async () => undefined);
const notifySanction = vi.fn(async () => undefined);
const notifyReporter = vi.fn(async () => undefined);

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({
    ok: true,
    userId: "admin-1",
    actor: { userId: "admin-1", isSuperAdmin, permissions: ["reports"] },
    sb,
  }),
}));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => audit(...(a as [])),
}));
vi.mock("@/lib/points/community-point-bridge", () => ({
  applyCommunityPointReclaimFromReportTarget: (...a: unknown[]) => reclaim(...(a as [])),
}));
vi.mock("@/lib/notifications/notify-community-moderation", () => ({
  notifyCommunityContentModerated: (...a: unknown[]) => notifyContent(...(a as [])),
  notifyCommunitySanction: (...a: unknown[]) => notifySanction(...(a as [])),
  notifyCommunityReportProcessed: (...a: unknown[]) => notifyReporter(...(a as [])),
}));
vi.mock("@/lib/community-feed/admin-community-reports", () => ({
  getCommunityReportByIdForAdmin: async () => null,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => serviceClient,
}));

import { POST as decide } from "@/app/api/admin/community-reports/[id]/decision/route";
import { PATCH as patchReport } from "@/app/api/admin/community-reports/[id]/route";
import {
  assertCommunityWriteAllowed,
  communityRestrictionScopesFor,
} from "@/lib/community/community-write-restriction";

function req(method: string, body: unknown) {
  return new Request("https://x.test/api/admin/community-reports/r1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
const ctx = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  isSuperAdmin = false;
  serviceClient = sb;
  rpcResult = { data: null, error: null };
  handler = () => ({ data: null, error: null });
});

describe("POST community-reports/:id/decision", () => {
  const base = { expectedStatus: "open", decision: "resolved", reason: "스팸 확인", targetAction: "hide" };

  it("400 reason_required before calling the RPC", async () => {
    const res = await decide(req("POST", { ...base, reason: " " }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 dismiss_with_action when dismissing with a content action", async () => {
    const res = await decide(req("POST", { ...base, decision: "dismissed" }), ctx);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("409 conflict carries current_status and runs no side effects", async () => {
    rpcResult = { data: { ok: false, error: "conflict", current_status: "resolved" }, error: null };
    const res = await decide(req("POST", base), ctx);
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; current_status: string };
    expect(j).toMatchObject({ error: "conflict", current_status: "resolved" });
    expect(reclaim).not.toHaveBeenCalled();
    expect(notifyReporter).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("ok: reclaims points, notifies author + reporters (incl. closed), audits decision", async () => {
    rpcResult = {
      data: {
        ok: true,
        status: "resolved",
        target_type: "post",
        target_id: "p1",
        target_user_id: "author-1",
        target_found: true,
        reporter_id: "rep-1",
        actions: [{ action: "hide", target_type: "post", from_status: "active" }],
        closed_report_ids: ["r2"],
      },
      error: null,
    };
    handler = (c) =>
      c.table === "community_reports" ? { data: [{ id: "r2", user_id: "rep-2" }], error: null } : { data: null, error: null };
    const res = await decide(req("POST", { ...base, closeSameTarget: true }), ctx);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "admin_community_report_decide",
      expect.objectContaining({ p_report_id: "r1", p_expected_status: "open", p_target_action: "hide", p_close_same_target: true })
    );
    expect(reclaim).toHaveBeenCalledWith({ targetType: "post", targetId: "p1" });
    expect(notifyContent).toHaveBeenCalledWith(sb, expect.objectContaining({ userId: "author-1", postId: "p1", kind: "hidden" }));
    expect(notifyReporter).toHaveBeenCalledTimes(2);
    const actions = (audit.mock.calls as unknown as Array<[unknown, unknown, { action: string }]>).map((c) => c[2].action);
    expect(actions).toContain("community_report.decision");
    expect(actions).toContain("community_post.status_hidden");
  });
});

describe("PATCH community-reports/:id", () => {
  it("status change without adminMemo key does not touch admin_memo (C-10)", async () => {
    handler = (c) => {
      if (c.op === "select" && c.terminal === "maybeSingle") {
        return { data: { status: "open", target_type: "post", target_id: "p1", admin_memo: "기존 메모" }, error: null };
      }
      if (c.op === "update") return { data: [{ id: "r1" }], error: null };
      return { data: null, error: null };
    };
    const res = await patchReport(req("PATCH", { status: "reviewing", expectedStatus: "open" }), ctx);
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(upd.values).toEqual({ status: "reviewing" });
    expect(upd.values).not.toHaveProperty("admin_memo");
  });

  it("resolved via PATCH is refused (decision endpoint only)", async () => {
    handler = (c) =>
      c.op === "select" ? { data: { status: "reviewing", target_type: "post", target_id: "p1" }, error: null } : { data: null, error: null };
    const res = await patchReport(req("PATCH", { status: "resolved" }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("use_decision_endpoint");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 when expectedStatus is stale", async () => {
    handler = (c) =>
      c.op === "select" ? { data: { status: "resolved", target_type: "post", target_id: "p1" }, error: null } : { data: null, error: null };
    const res = await patchReport(req("PATCH", { status: "reviewing", expectedStatus: "open" }), ctx);
    expect(res.status).toBe(409);
  });
});

describe("community write gate", () => {
  it("403 community_restricted for an actively restricted member", async () => {
    handler = (c) =>
      c.table === "sanctions"
        ? { data: [{ id: "s1", restriction: "all", end_at: "2026-10-26T00:00:00Z" }], error: null }
        : { data: null, error: null };
    const res = await assertCommunityWriteAllowed("u1", "comment");
    expect(res?.status).toBe(403);
    const j = (await res!.json()) as { error: string; restriction: string; messageKo: string };
    expect(j.error).toBe("community_restricted");
    expect(j.restriction).toBe("all");
    expect(j.messageKo).toContain("커뮤니티 활동이 제한되어 있습니다");
    const call = fake.calls.find((c) => c.table === "sanctions")!;
    expect(call.filters).toContainEqual(["in", "restriction", ["comment", "all"]]);
  });

  it("allows (null) when the lookup errors — transient failure must not block all members", async () => {
    handler = () => ({ data: null, error: { message: "timeout" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await assertCommunityWriteAllowed("u1", "post")).toBeNull();
    spy.mockRestore();
  });

  it("allows when not restricted", async () => {
    handler = () => ({ data: [], error: null });
    expect(await assertCommunityWriteAllowed("u1", "report")).toBeNull();
  });

  it("scope mapping: report/meeting blocked only by 'all'", () => {
    expect(communityRestrictionScopesFor("post")).toEqual(["post", "all"]);
    expect(communityRestrictionScopesFor("comment")).toEqual(["comment", "all"]);
    expect(communityRestrictionScopesFor("report")).toEqual(["all"]);
    expect(communityRestrictionScopesFor("meeting")).toEqual(["all"]);
  });
});

describe("transition tables", () => {
  it("feed report PATCH transitions", () => {
    expect(resolveCommunityReportPatchTransition("open", "reviewing", false)).toEqual({ ok: true, kind: "review" });
    expect(resolveCommunityReportPatchTransition("resolved", "open", false)).toEqual({ ok: false, error: "reopen_super_admin_only" });
    expect(resolveCommunityReportPatchTransition("dismissed", "open", true)).toEqual({ ok: true, kind: "reopen" });
    expect(resolveCommunityReportPatchTransition("reviewing", "open", true)).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("meeting report transitions", () => {
    expect(resolveMeetingReportTransition("pending", "reviewing", false)).toMatchObject({ ok: true, reasonRequired: false });
    expect(resolveMeetingReportTransition("reviewing", "rejected", false)).toMatchObject({ ok: true, reasonRequired: true });
    expect(resolveMeetingReportTransition("resolved", "pending", false)).toEqual({ ok: false, error: "reopen_super_admin_only" });
    expect(resolveMeetingReportTransition("resolved", "rejected", true)).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("sanction input: only 1/3/7/30 days or permanent", () => {
    expect(parseCommunitySanctionInput({ kind: "community_restriction", restriction: "post", days: 7 })).toMatchObject({ ok: true });
    expect(parseCommunitySanctionInput({ kind: "community_restriction", restriction: "post", days: 5 })).toEqual({ ok: false, error: "invalid_days" });
    expect(parseCommunitySanctionInput({ kind: "community_restriction", restriction: "post" })).toMatchObject({ ok: true, value: { days: null } });
    expect(parseCommunitySanctionInput({ kind: "warning", restriction: "all", days: 3 })).toEqual({
      ok: true,
      value: { kind: "warning", restriction: null, days: null },
    });
  });
});
