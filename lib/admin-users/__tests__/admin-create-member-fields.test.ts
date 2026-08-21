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

  it("allows empty email and does not require address when not touched", () => {
    const errors = validateAdminCreateMemberForm(
      {
        username: "qa_user",
        password: "pass12",
        nickname: "닉네임",
        name: "이름",
        email: "",
        contactPhoneDigits: "",
        accountType: "development_member",
        address: emptyAdminCreateMemberAddress(),
      },
      { addressAttempted: false, phoneRuleKey: "phone_rule" }
    );
    expect(errors).toEqual({});
  });
});
