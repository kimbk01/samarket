import { describe, expect, it } from "vitest";
import {
  buildProfileEditIncompleteBody,
  captureProfileEditFormSnapshot,
  isProfileEditFormDirty,
  listIncompleteProfileEditFields,
  validateOptionalNickname,
} from "@/lib/profile/profile-edit-form-helpers";

describe("profile-edit-form-helpers", () => {
  it("validateOptionalNickname allows empty nickname", () => {
    expect(validateOptionalNickname("", { min: "min", max: "max" })).toEqual({});
  });

  it("validateOptionalNickname rejects partial nickname", () => {
    expect(validateOptionalNickname("a", { min: "min", max: "max" })).toEqual({
      displayName: "min",
    });
  });

  it("isProfileEditFormDirty detects avatar/bio/name changes", () => {
    const baseline = captureProfileEditFormSnapshot({
      displayName: "Hong",
      bio: "hello",
      avatarUrl: "https://example.com/a.png",
    });
    expect(
      isProfileEditFormDirty(
        baseline,
        captureProfileEditFormSnapshot({
          displayName: "Hong",
          bio: "changed",
          avatarUrl: "https://example.com/a.png",
        }),
      ),
    ).toBe(true);
  });

  it("listIncompleteProfileEditFields skips phone when verification disabled", () => {
    expect(
      listIncompleteProfileEditFields(
        { nickname: false, phone: false, address: false, dibay_id: true },
        false,
      ),
    ).toEqual(["nickname", "address"]);
  });

  it("buildProfileEditIncompleteBody joins labels", () => {
    expect(
      buildProfileEditIncompleteBody(["nickname", "phone"], {
        nickname: "닉네임",
        phone: "전화",
        address: "주소",
        dibay_id: "아이디",
      }),
    ).toBe("닉네임 · 전화");
  });
});
