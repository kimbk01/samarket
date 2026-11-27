/**
 * 어드민 회원 영구 삭제 실패 10건 (2026-11-27) — 설계 docs/audit/admin-user-purge-failures-2026-11-27/design.md
 * C1 삭제 전 준비 · C2 Auth 삭제 성공 뒤에만 「완료」·user_purge 기록 · C3 시스템 계정 409
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/legal/marketing-consent.server", () => ({ writeMemberMarketingConsent: async () => ({ ok: true }) }));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateAllUserPushTokensForAccountRemoval: async () => ({ ok: true, errors: [] }),
}));
vi.mock("@/lib/auth/native/apple-siwa-token.server", () => ({
  revokeAppleSigninTokenForUser: async () => ({ status: "skipped" }),
}));
vi.mock("@/lib/admin-business/suspend-owner-store-sales-on-member-sanction", () => ({
  suspendOwnerStoreSalesOnMemberSanction: async () => [],
}));
const moderation = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/admin/admin-user-server", () => ({
  insertModerationEvent: (...a: unknown[]) => moderation(...a),
  invalidateAllUserSessions: async () => undefined,
  isSuperAdminRole: () => false,
}));
vi.mock("@/lib/admin/admin-membership", () => ({ loadActiveAdminMembership: async () => null }));
vi.mock("@/lib/i18n/admin-server-language", () => ({ adminServerText: async (k: string) => k }));

type Rpc = (name: string, args: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
let rpc: Rpc;
let deleteUser: ReturnType<typeof vi.fn>;
let deletionRequestUpdates: number;

function makeSb() {
  const profileChain = {
    select: () => profileChain,
    eq: () => profileChain,
    maybeSingle: async () => ({ data: { id: "u1", status: "verified_user", nickname: "n" }, error: null }),
  };
  const requestsChain = {
    update: () => {
      deletionRequestUpdates += 1;
      return requestsChain;
    },
    eq: () => requestsChain,
    in: async () => ({ data: null, error: null }),
  };
  return {
    from: (t: string) => (t === "account_deletion_requests" ? requestsChain : profileChain),
    rpc: (name: string, args: unknown) => rpc(name, args),
    auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...a) } },
  };
}

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: makeSb(), actor: { userId: "admin-1" } }),
}));

async function call() {
  const { POST } = await import("@/app/api/admin/users/[id]/delete/route");
  const req = new NextRequest("http://x/api/admin/users/u1/delete", {
    method: "POST",
    body: JSON.stringify({ mode: "purge", reason: "시험 사유 입력입니다" }),
  });
  return POST(req, { params: Promise.resolve({ id: "u1" }) });
}

const auditActions = () => audit.mock.calls.map((c) => (c[1] as { action: string }).action);

describe("어드민 영구 삭제 (설계 C1~C3)", () => {
  beforeEach(() => {
    audit.mockClear();
    moderation.mockClear();
    deletionRequestUpdates = 0;
    deleteUser = vi.fn(async () => ({ error: null }));
    rpc = async (name) =>
      name === "admin_can_purge_auth_user"
        ? { data: { ok: true, blockers: [] }, error: null }
        : { data: { ok: true, deliveries_deleted: 2 }, error: null };
  });

  it("성공: 준비 함수 → Auth 삭제 → 탈퇴 요청 완료 → 감사 user_purge", async () => {
    const calls: string[] = [];
    const base = rpc;
    rpc = async (n, a) => {
      calls.push(n);
      return base(n, a);
    };
    const res = await call();
    expect(res.status).toBe(200);
    expect(calls).toEqual(["admin_can_purge_auth_user", "admin_prepare_auth_user_purge"]);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deletionRequestUpdates).toBe(1);
    expect(auditActions()).toEqual(["user_purge"]);
  });

  it("Auth 삭제 실패: 500 · 감사 user_purge_failed 만 · 탈퇴 요청 그대로", async () => {
    deleteUser = vi.fn(async () => ({ error: { message: "Database error deleting user" } }));
    const res = await call();
    expect(res.status).toBe(500);
    expect(auditActions()).toEqual(["user_purge_failed"]);
    expect(deletionRequestUpdates).toBe(0);
    /** 실패해도 제재 이력에 「영구 삭제」가 남지 않는다 */
    expect(moderation).not.toHaveBeenCalled();
  });

  it("시스템 계정: 409 시스템 계정 문구 · 준비·Auth 삭제·기록 없음", async () => {
    const calls: string[] = [];
    rpc = async (n) => {
      calls.push(n);
      return { data: { ok: false, blockers: ["community_import_principal"] }, error: null };
    };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "purge_blocked", message: "admin_api_users_purge_system_account" });
    expect(calls).toEqual(["admin_can_purge_auth_user"]);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("준비 함수가 운영 DB 에 아직 없으면 건너뛰고 지금처럼 삭제", async () => {
    rpc = async (n) =>
      n === "admin_can_purge_auth_user"
        ? { data: { ok: true, blockers: [] }, error: null }
        : { data: null, error: { message: "Could not find the function public.admin_prepare_auth_user_purge(p_user_id) in the schema cache" } };
    const res = await call();
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it("준비 함수 오류: 500 · 아무것도 바꾸지 않음", async () => {
    rpc = async (n) =>
      n === "admin_can_purge_auth_user"
        ? { data: { ok: true, blockers: [] }, error: null }
        : { data: null, error: { message: "statement timeout" } };
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "purge_prepare_failed" });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(deletionRequestUpdates).toBe(0);
  });
});
