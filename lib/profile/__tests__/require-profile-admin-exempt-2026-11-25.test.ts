import { describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ privileged: false, calls: 0 }));
vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: async () => {
    admin.calls += 1;
    return admin.privileged;
  },
}));

import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";

/** 전체 감사 B2 — 전화 미인증 관리자는 라우트 필수 정보에서 전화 면제, 일반 회원은 그대로 403 */
const row = {
  id: "u1",
  display_name: "관리자",
  nickname: "관리자",
  dibay_id: "admin01",
  dibay_id_locked: true,
  username_confirmed: true,
  phone_verified: false,
  phone_verified_at: null,
  phone: null,
  role: "user",
  provider: "kakao",
  auth_provider: "kakao",
  email: null,
};

describe("requireProfileFieldsForAction — 관리자 전화 면제", () => {
  it("관리자 → 통과 (관리자 확인 1회)", async () => {
    admin.privileged = true;
    admin.calls = 0;
    const r = await requireProfileFieldsForAction({} as never, "u1", "messenger_send_message", row);
    expect(r.ok).toBe(true);
    expect(admin.calls).toBe(1);
  });
  it("일반 회원 → 403 phone_verified", async () => {
    admin.privileged = false;
    const r = await requireProfileFieldsForAction({} as never, "u1", "messenger_send_message", row);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingFields).toContain("phone_verified");
  });
  it("전화가 인증된 회원은 관리자 확인을 하지 않는다 (요청 증가 없음)", async () => {
    admin.calls = 0;
    const r = await requireProfileFieldsForAction({} as never, "u1", "messenger_send_message", {
      ...row,
      phone_verified: true,
      phone: "09171234567",
    });
    expect(r.ok).toBe(true);
    expect(admin.calls).toBe(0);
  });
});
