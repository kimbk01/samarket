/**
 * PR #687 재감사 5 — 정지된 운영자(최고관리자 제외)는 어드민 알림 받는 사람·담당자에서 빠진다 (동작).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/admin-membership", () => ({
  loadActiveAdminMembership: vi.fn(async (_sb: unknown, userId: string) => ({
    id: `m-${userId}`,
    user_id: userId,
    role: userId.startsWith("super") ? "super_admin" : "admin",
    status: "active",
    admin_tier: "operator",
  })),
  resolveEffectiveAdminRole: vi.fn(async (_sb: unknown, userId: string) => (userId.startsWith("super") ? "super_admin" : "admin")),
}));
vi.mock("@/lib/admin/admin-user-server", () => ({
  isSuperAdminRole: (role: string | null | undefined) => role === "super_admin",
  loadEffectiveStaffPermissions: vi.fn(async () => ["support"]),
  permissionKeyAllowed: (perms: string[], key: string) => perms.includes(key),
}));

import {
  authorityAllows,
  authorityConfirmedLoss,
  createAdminNotification,
  resolveAdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";

function sbWithProfiles(profiles: Record<string, { status: string } | null>, fail = false) {
  return {
    from: (table: string) => {
      expect(table).toBe("profiles");
      let id = "";
      const b = {
        select: () => b,
        eq: (_c: string, v: string) => {
          id = v;
          return b;
        },
        maybeSingle: async () => (fail ? { data: null, error: { message: "boom" } } : { data: profiles[id] ?? null, error: null }),
      };
      return b;
    },
  } as never;
}

describe("재감사 5 — 정지 운영자는 알림 받는 사람이 아니다", () => {
  it("정지 운영자 = 비활성 · 정상 운영자 = support 허용", async () => {
    const sb = sbWithProfiles({ op1: { status: "suspended" }, op2: { status: "active" } });
    const suspended = await resolveAdminRecipientAuthority(sb, "op1");
    expect(suspended).toEqual({ active: false });
    expect(authorityAllows(suspended, "support")).toBe(false);
    const ok = await resolveAdminRecipientAuthority(sb, "op2");
    expect(authorityAllows(ok, "support")).toBe(true);
  });

  it("S-7 (2026-11-29): 차단·탈퇴(로그인 불가) 운영자도 비활성", async () => {
    const sb = sbWithProfiles({ op3: { status: "blocked" }, op4: { status: "withdrawn" } });
    expect(await resolveAdminRecipientAuthority(sb, "op3")).toEqual({ active: false });
    expect(await resolveAdminRecipientAuthority(sb, "op4")).toEqual({ active: false });
  });

  it("최고관리자는 정지여도 받는다(잠김 방지 — 앱 규칙과 같음) · 프로필을 읽지 않는다", async () => {
    const sb = sbWithProfiles({ super1: { status: "suspended" } });
    const a = await resolveAdminRecipientAuthority(sb, "super1");
    expect(authorityAllows(a, "support")).toBe(true);
  });

  it("결정 4 (2026-11-29): 프로필 읽기 실패 = 정지로 본다(fail-closed · RLS 와 같게)", async () => {
    const sb = sbWithProfiles({}, true);
    const a = await resolveAdminRecipientAuthority(sb, "op3");
    // 재감사 2차 1: 받는 사람으로는 보지 않되(fail-closed) 「판정 못 함」 표시 — 담당 해제 근거가 아니다
    expect(a).toEqual({ active: false, unknown: true });
    expect(authorityAllows(a, "support")).toBe(false);
    expect(authorityConfirmedLoss(a, "support")).toBe(false);
    // 확인된 정지는 잃음
    const suspended = await resolveAdminRecipientAuthority(sbWithProfiles({ op9: { status: "suspended" } }), "op9");
    expect(authorityConfirmedLoss(suspended, "support")).toBe(true);
  });

  it("결정 4: 최고관리자는 프로필을 읽지 않으므로 읽기 실패와 무관하게 받는다", async () => {
    const sb = sbWithProfiles({}, true);
    const a = await resolveAdminRecipientAuthority(sb, "super2");
    expect(authorityAllows(a, "support")).toBe(true);
  });
});

describe("재감사 2차 1 — 받지 못한 후보 중 「권한 잃음 확인」만 따로 센다(담당 해제 근거)", () => {
  const input = {
    recipientAdminIds: ["op1"],
    requiredPermission: "support" as const,
    kind: "support_customer_replied",
    title: "t",
    dedupeKey: "support_customer_replied:m1",
  };
  it("프로필 읽기 실패(판정 못 함) → 받지 않음(skipped 1) 이지만 revoked 0", async () => {
    const r = await createAdminNotification({} as never, input, { resolveAuthority: async () => ({ active: false, unknown: true }) });
    expect(r).toMatchObject({ ok: true, created: 0, skippedRecipients: 1, revokedRecipients: 0 });
  });
  it("정지 확인 → revoked 1", async () => {
    const r = await createAdminNotification({} as never, input, { resolveAuthority: async () => ({ active: false }) });
    expect(r).toMatchObject({ ok: true, created: 0, skippedRecipients: 1, revokedRecipients: 1 });
  });
});
