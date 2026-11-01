import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 순서 4 — 가입 상태 확인: 프로필 · 기본 주소 · 활성 관리자를 DB 함수 1회로.
 * 함수 실패 → 기존 표별 조회(프로필 · 주소 · 관리자). 필요한 항목 없는 기능(messenger_open)은 조회 0.
 */
vi.mock("@/lib/legal/resolve-required-consent-versions", () => ({
  resolveRequiredConsentVersions: async () => ({ termsVersion: "T1", privacyVersion: "P1" }),
}));

import { invalidateAdminMembershipJudgmentCache } from "@/lib/admin/admin-membership";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";

type Rows = Record<string, Array<Record<string, unknown>>>;

function makeSb(opts: { rpc?: { data: unknown; error: unknown } | "throw" | "none"; rows?: Rows }) {
  const log = { rpc: [] as string[], tables: [] as string[] };
  const rows = opts.rows ?? {};
  const sb: Record<string, unknown> = {
    from(table: string) {
      log.tables.push(table);
      const list = rows[table] ?? [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.limit = async () => ({ data: list, error: null });
      chain.maybeSingle = async () => ({ data: list[0] ?? null, error: null });
      return chain;
    },
  };
  if (opts.rpc !== "none") {
    sb.rpc = async (fn: string) => {
      log.rpc.push(fn);
      if (opts.rpc === "throw") throw new Error("boom");
      return opts.rpc ?? { data: null, error: null };
    };
  }
  return { sb: sb as never, log };
}

const PROFILE = {
  id: "u1",
  username: "dibay_abc",
  username_confirmed: true,
  dibay_id: "dibay_abc",
  dibay_id_locked: true,
  display_name: " 홍길동 ",
  avatar_url: null,
  nickname: null,
  email: "a@b.c",
  role: "user",
  phone_verified: true,
  phone_verified_at: "2026-10-01T00:00:00Z",
  phone_verification_method: "sms",
  provider: "email",
  auth_provider: "email",
  terms_accepted_at: "2026-10-01T00:00:00Z",
  terms_version: "T1",
  privacy_accepted_at: "2026-10-01T00:00:00Z",
  privacy_version: "P1",
  onboarding_completed_at: "2026-10-01T00:00:00Z",
  onboarding_status: "completed",
};

describe("순서 4 getOnboardingStatus — DB 함수 1회", () => {
  it("함수 1회 · 표 조회 0 · 기존 경로와 같은 판정", async () => {
    const viaRpc = makeSb({
      rpc: { data: { profile: PROFILE, has_default_address: true, admin_role: null }, error: null },
    });
    const legacy = makeSb({
      rpc: "none",
      rows: { profiles: [PROFILE], user_addresses: [{ id: "a1" }], admin_memberships: [] },
    });
    const a = await getOnboardingStatus(viaRpc.sb, "u1");
    const b = await getOnboardingStatus(legacy.sb, "u1");
    expect(viaRpc.log.rpc).toEqual(["member_onboarding_facts"]);
    expect(viaRpc.log.tables).toEqual([]);
    expect(legacy.log.tables.sort()).toEqual(["admin_memberships", "profiles", "user_addresses"]);
    expect(a).toEqual(b);
    expect(a.signupComplete).toBe(true);
    expect(a.addressComplete).toBe(true);
    expect(a.displayName).toBe("홍길동");
  });

  it("관리자(master → super_admin) 면제 판정 동일", async () => {
    const noConsent = { ...PROFILE, terms_accepted_at: null, terms_version: null, phone_verified: false };
    const viaRpc = makeSb({
      rpc: { data: { profile: noConsent, has_default_address: false, admin_role: "master" }, error: null },
    });
    const legacy = makeSb({
      rpc: "none",
      rows: { profiles: [noConsent], user_addresses: [], admin_memberships: [{ role: "master" }] },
    });
    const a = await getOnboardingStatus(viaRpc.sb, "u1");
    const b = await getOnboardingStatus(legacy.sb, "u1");
    expect(a).toEqual(b);
    expect(a.isPrivilegedAdmin).toBe(true);
    expect(a.signupComplete).toBe(true);
    expect(viaRpc.log.tables).toEqual([]);
  });

  it("프로필 없음 → profileExists false (관리자 판정 안 함)", async () => {
    const viaRpc = makeSb({ rpc: { data: { profile: null, has_default_address: false, admin_role: "admin" }, error: null } });
    const a = await getOnboardingStatus(viaRpc.sb, "u1");
    expect(a.profileExists).toBe(false);
    expect(a.isPrivilegedAdmin).toBe(false);
    expect(a.signupComplete).toBe(false);
  });

  it("함수 오류·예외 → 기존 표별 조회", async () => {
    for (const rpc of [{ data: null, error: { message: "fn missing" } }, "throw" as const]) {
      // 같은 사용자를 두 번 판정 — 관리자 판정 캐시(2026-11-02)를 비워 매번 기존 경로를 확인한다.
      invalidateAdminMembershipJudgmentCache();
      const s = makeSb({
        rpc,
        rows: { profiles: [PROFILE], user_addresses: [{ id: "a1" }], admin_memberships: [] },
      });
      const a = await getOnboardingStatus(s.sb, "u1");
      expect(a.signupComplete).toBe(true);
      expect(s.log.tables.sort()).toEqual(["admin_memberships", "profiles", "user_addresses"]);
    }
  });
});

describe("순서 4 requireProfileFieldsForAction — 필요한 항목 없으면 조회 0", () => {
  beforeEach(() => vi.clearAllMocks());

  it("messenger_open → 통과 · 표 조회 0", async () => {
    const s = makeSb({ rpc: "none" });
    expect(await requireProfileFieldsForAction(s.sb, "u1", "messenger_open")).toEqual({ ok: true });
    expect(s.log.tables).toEqual([]);
  });

  it("messenger_add_friend → 프로필 읽고 판정 (기존과 같음)", async () => {
    const s = makeSb({ rpc: "none", rows: { profiles: [{ ...PROFILE, display_name: null, nickname: null }] } });
    const r = await requireProfileFieldsForAction(s.sb, "u1", "messenger_add_friend");
    expect(r.ok).toBe(false);
    expect(s.log.tables).toEqual(["profiles"]);
  });
});
