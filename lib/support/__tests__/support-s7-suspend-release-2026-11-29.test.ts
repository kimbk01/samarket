/**
 * 고객센터 전체 수정 S-7 (2026-11-29) — 회원 정지(suspend)로 운영자가 정지되면, 권한 회수와 같은 규칙으로 진행 중 담당을 푼다
 * (`releaseSupportAssignmentsIfNoSupportPermission` → 해제 + 답 못 받은 고객 글 전원 다시 알림). 동작 시험.
 */
import "@/lib/i18n/admin-catalog";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const releaseCalls: { userId: string; changedBy: string | null }[] = [];
vi.mock("@/lib/support/support-assignee-permission-sync", () => ({
  releaseSupportAssignmentsIfNoSupportPermission: vi.fn(async (_sb: unknown, input: { userId: string; changedBy: string | null }) => {
    releaseCalls.push(input);
  }),
}));
vi.mock("@/lib/admin/admin-user-server", () => ({
  insertModerationEvent: vi.fn(async () => "log-1"),
  invalidateAllUserSessions: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/admin-business/suspend-owner-store-sales-on-member-sanction", () => ({
  suspendOwnerStoreSalesOnMemberSanction: vi.fn(async () => []),
  listOwnerStoresSalesSuspendedBySanction: vi.fn(async () => []),
}));
vi.mock("@/lib/admin-users/member-moderation-target", () => ({
  assertMemberModerationTargetAllowed: vi.fn(async () => ({ ok: true })),
}));

import { handleAdminMemberModerationPost } from "@/lib/admin/shared-handlers/admin-member-moderation";

const TARGET = "66666666-6666-4666-8666-666666666666";
const ACTOR = "77777777-7777-4777-8777-777777777777";

function sbWithProfile(status: string) {
  const profile = { id: TARGET, status, deleted_at: null, nickname: "op" };
  const b = {
    select: () => b,
    update: (patch: Record<string, unknown>) => {
      Object.assign(profile, patch);
      return b;
    },
    eq: () => b,
    maybeSingle: async () => ({ data: profile, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
  };
  return { from: () => b, auth: { admin: { updateUserById: async () => ({ error: null }) } } } as never;
}

const post = (action: string) =>
  handleAdminMemberModerationPost(
    { sb: sbWithProfile("active"), actor: { userId: ACTOR, isSuperAdmin: true } } as never,
    new NextRequest(`http://x/api/admin/users/${TARGET}/moderation`, {
      method: "POST",
      body: JSON.stringify({ action, reason: "운영 정책 위반으로 정지합니다" }),
    }),
    { params: Promise.resolve({ id: TARGET }) }
  );

beforeEach(() => {
  releaseCalls.length = 0;
});

describe("S-7 — 담당자 정지 = 담당 해제 + 전원 다시 알림 (권한 회수와 같은 규칙)", () => {
  it("정지(suspend) 처리는 그 사람의 진행 중 고객센터 담당을 푸는 규칙을 부른다", async () => {
    const res = await post("suspend");
    expect(res.status).toBe(200);
    expect(releaseCalls).toEqual([{ userId: TARGET, changedBy: ACTOR }]);
  });

  it("차단(ban) 처리도 같은 규칙을 부른다(로그인 불가 = 받을 수 없는 담당자)", async () => {
    const res = await post("ban");
    expect(res.status).toBe(200);
    expect(releaseCalls).toEqual([{ userId: TARGET, changedBy: ACTOR }]);
  });

  it("경고(warn)는 담당을 건드리지 않는다", async () => {
    const res = await post("warn");
    expect(res.status).toBe(200);
    expect(releaseCalls).toHaveLength(0);
  });
});
