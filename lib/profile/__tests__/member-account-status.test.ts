import { describe, expect, it } from "vitest";
import { deriveMemberAccountStatus } from "@/lib/profile/member-account-status";
import type { ProfileRow } from "@/lib/profile/types";

function baseProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    email: "u@example.com",
    display_name: "홍길동",
    nickname: "홍길동",
    avatar_url: null,
    bio: null,
    region_code: null,
    region_name: null,
    address_street_line: null,
    address_detail: null,
    latitude: null,
    longitude: null,
    full_address: null,
    phone: "09171234567",
    phone_verified: true,
    phone_verification_status: "verified",
    phone_verified_at: "2026-01-01T00:00:00.000Z",
    realname: null,
    realname_verified: false,
    status: "active",
    role: "user",
    member_type: "normal",
    is_special_member: false,
    points: 0,
    manner_score: 36.5,
    preferred_language: "ko",
    preferred_country: "PH",
    auth_provider: "google",
    ...overrides,
  } as ProfileRow;
}

describe("deriveMemberAccountStatus", () => {
  it("treats auto-assigned @id as normal and changeable once", () => {
    const status = deriveMemberAccountStatus(
      baseProfile({
        dibay_id: "dibay_ab12cd",
        dibay_id_auto_assigned: true,
        dibay_id_changed_once: false,
        dibay_id_locked: false,
        username: "dibay_ab12cd",
        username_confirmed: true,
      }),
      { hasDefaultAddress: true },
    );
    expect(status.handle.autoAssigned).toBe(true);
    expect(status.handle.canChange).toBe(true);
    expect(status.handle.changedOnce).toBe(false);
    expect(status.handle.atDisplay).toBe("@dibay_ab12cd");
    expect(status.phone.verified).toBe(true);
    expect(status.address.registered).toBe(true);
  });

  it("marks custom @id as changed and not changeable", () => {
    const status = deriveMemberAccountStatus(
      baseProfile({
        dibay_id: "mycustomid",
        dibay_id_auto_assigned: false,
        dibay_id_changed_once: true,
        dibay_id_locked: true,
        username: "mycustomid",
        username_confirmed: true,
      }),
      { hasDefaultAddress: false },
    );
    expect(status.handle.canChange).toBe(false);
    expect(status.handle.changedOnce).toBe(true);
    expect(status.handle.atDisplay).toBe("@mycustomid");
    expect(status.address.registered).toBe(false);
  });

  it("does not treat phone string presence as verified", () => {
    const status = deriveMemberAccountStatus(
      baseProfile({
        phone: "09171234567",
        phone_verified: false,
        phone_verified_at: null,
        phone_verification_status: "pending",
        auth_provider: "google",
      }),
      { hasDefaultAddress: true },
    );
    expect(status.phone.value).toBeTruthy();
    expect(status.phone.verified).toBe(false);
  });
});
