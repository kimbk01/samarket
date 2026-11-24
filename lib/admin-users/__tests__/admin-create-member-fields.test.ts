import { describe, expect, it } from "vitest";
import {
  mapAdminCreateMemberApiField,
  validateAdminCreateMemberForm,
} from "@/lib/admin-users/admin-create-member-fields";
import { emptyAdminCreateMemberAddress } from "@/lib/admin-users/admin-create-member-address";

describe("admin-create-member-fields", () => {
  it("maps each API field to the matching form field (no fall-through to addressSearch)", () => {
    expect(mapAdminCreateMemberApiField("username")).toBe("username");
    expect(mapAdminCreateMemberApiField("password")).toBe("password");
    expect(mapAdminCreateMemberApiField("email")).toBe("email");
    expect(mapAdminCreateMemberApiField("address")).toBe("addressSearch");
  });

  /** 가입 SSOT 2026-11-24 S4 — 전화·대표 주소 필수 (이메일은 여전히 선택) */
  it("allows empty email but requires phone and main address", () => {
    const errors = validateAdminCreateMemberForm(
      {
        username: "qa_user",
        password: "pass12",
      passwordConfirm: "pass12",
        nickname: "닉네임",
        name: "이름",
        email: "",
        contactPhoneDigits: "",
        accountType: "development_member",
        address: emptyAdminCreateMemberAddress(),
      },
      { addressAttempted: false, phoneRuleKey: "phone_rule" }
    );
    expect(errors).toEqual({
      contactPhone: "admin_users_err_phone_required",
      addressSearch: "addr_ui_pick_search_result",
    });
  });
});

describe("회원 생성 연락처 — 한국·필리핀 번호", () => {
  const base = {
    username: "krphone",
    password: "Passw0rd!x",
    passwordConfirm: "Passw0rd!x",
    nickname: "kr",
    name: "kr",
    email: "",
    accountType: "operations_member" as const,
    address: emptyAdminCreateMemberAddress(),
  };
  const opts = { addressAttempted: false, phoneRuleKey: "admin_users_member_verify_invalid_phone" as const };
  it("한국·필리핀 번호는 통과, 그 외는 연락처 오류", () => {
    for (const p of ["010-1234-5678", "+82 10 1234 5678", "0917 123 4567", "+639171234567"]) {
      expect(validateAdminCreateMemberForm({ ...base, contactPhoneDigits: p }, opts).contactPhone).toBeUndefined();
    }
    expect(validateAdminCreateMemberForm({ ...base, contactPhoneDigits: "0812345678" }, opts).contactPhone).toBe(
      "admin_users_member_verify_invalid_phone",
    );
  });
});
