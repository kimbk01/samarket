import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveMemberAccountStatus } from "@/lib/profile/member-account-status";
import { resolveMypageHomeRequiredItems } from "@/lib/mypage/mypage-home-required-items";
import type { ProfileRow } from "@/lib/profile/types";

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    nickname: "홍길동",
    display_name: "홍길동",
    dibay_id: "dibay_ab12cd",
    dibay_id_auto_assigned: true,
    dibay_id_changed_once: false,
    dibay_id_locked: false,
    username: "dibay_ab12cd",
    username_confirmed: true,
    phone: "09171234567",
    phone_verified: true,
    phone_verified_at: "2026-01-01T00:00:00.000Z",
    phone_verification_status: "verified",
    role: "user",
    status: "active",
    auth_provider: "google",
    manner_score: 36.5,
    ...overrides,
  } as ProfileRow;
}

const noHandle = { dibay_id: null, username: null, username_confirmed: false } as Partial<ProfileRow>;
const unverifiedPhone = {
  phone_verified: false,
  phone_verified_at: null,
  phone_verification_status: "pending",
} as Partial<ProfileRow>;

function items(p: ProfileRow, addressRegistered: boolean) {
  return resolveMypageHomeRequiredItems({
    status: deriveMemberAccountStatus(p, { hasDefaultAddress: addressRegistered }),
    phoneStatus: "complete",
    addressStatus: addressRegistered ? "complete" : "required",
  });
}

describe("home required info — incomplete items only (8 combos)", () => {
  const cases: Array<[string, Partial<ProfileRow>, boolean, string[]]> = [
    ["all complete → block hidden", {}, true, []],
    ["address missing", {}, false, ["address"]],
    ["phone unverified", unverifiedPhone, true, ["phone"]],
    ["phone + address", unverifiedPhone, false, ["phone", "address"]],
    ["handle missing", noHandle, true, ["handle"]],
    ["handle + address", noHandle, false, ["handle", "address"]],
    ["handle + phone", { ...noHandle, ...unverifiedPhone }, true, ["handle", "phone"]],
    ["all three", { ...noHandle, ...unverifiedPhone }, false, ["handle", "phone", "address"]],
  ];
  for (const [name, overrides, addr, expected] of cases) {
    it(name, () => {
      expect(items(profile(overrides), addr)).toEqual(expected);
    });
  }

  it("one-time handle change available is NOT a requirement (S03 owns it)", () => {
    const st = deriveMemberAccountStatus(profile(), { hasDefaultAddress: true });
    expect(st.handle.canChange).toBe(true);
    expect(items(profile(), true)).toEqual([]);
  });

  it("unknown phone/address status or no profile → render nothing (no reserved slot)", () => {
    const status = deriveMemberAccountStatus(profile(unverifiedPhone), { hasDefaultAddress: false });
    expect(resolveMypageHomeRequiredItems({ status, phoneStatus: "unknown", addressStatus: "required" })).toEqual([]);
    expect(resolveMypageHomeRequiredItems({ status, phoneStatus: "required", addressStatus: "unknown" })).toEqual([]);
    expect(resolveMypageHomeRequiredItems({ status: null, phoneStatus: "complete", addressStatus: "complete" })).toEqual(
      [],
    );
  });
});

describe("bug: phone 「등록된 번호 없음」 + 「인증 완료」 contradiction", () => {
  it("verified flag with empty number columns → presentation verified_without_number, no home phone row", () => {
    const p = profile({ phone: null, phone_number: null, phone_country_code: null } as Partial<ProfileRow>);
    const st = deriveMemberAccountStatus(p, { hasDefaultAddress: true });
    expect(st.phone.verified).toBe(true);
    expect(st.phone.value).toBeNull();
    expect(st.phone.presentation).toBe("verified_without_number");
    expect(items(p, true)).not.toContain("phone");
  });

  it("admin exemption (privileged admin, no number) → no phone row", () => {
    const p = profile({
      ...unverifiedPhone,
      phone: null,
      role: "admin",
      privilegedAdmin: true,
    } as Partial<ProfileRow>);
    const st = deriveMemberAccountStatus(p, { hasDefaultAddress: true });
    expect(st.phone.verified).toBe(true);
    expect(st.phone.presentation).toBe("verified_without_number");
    expect(items(p, true)).toEqual([]);
  });

  it("presentation verified / unverified", () => {
    expect(deriveMemberAccountStatus(profile(), { hasDefaultAddress: true }).phone.presentation).toBe("verified");
    expect(
      deriveMemberAccountStatus(profile(unverifiedPhone), { hasDefaultAddress: true }).phone.presentation,
    ).toBe("unverified");
  });

  it("home component no longer renders the 「등록된 번호 없음」 value / 「인증 완료」 badge", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/mypage_phone_none/);
    expect(src).not.toMatch(/mypage_required_status_phone_done/);
  });
});

describe("bug: address 「변경」 shown twice", () => {
  it("registered address → no required row (change lives only in account 「주소관리」 row)", () => {
    expect(items(profile(), true)).not.toContain("address");
  });

  it("home component has no change-action key and no representative address hook", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/mypage_required_change_action/);
    expect(src).not.toMatch(/useRepresentativeFullAddressLine|useRepresentativeAddressLine/);
    // 미등록 줄 = 제목 + [주소 등록] 1개
    expect(src).toMatch(/mypage_home_required_address_cta/);
  });
});
