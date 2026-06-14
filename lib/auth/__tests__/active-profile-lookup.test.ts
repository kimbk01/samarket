import { describe, expect, it } from "vitest";
import { isActiveMemberProfile } from "@/lib/auth/active-profile-lookup";

describe("active-profile-lookup", () => {
  it("treats deleted profiles as inactive", () => {
    expect(isActiveMemberProfile({ id: "u1", status: "deleted", deleted_at: "2026-01-01" })).toBe(false);
    expect(isActiveMemberProfile({ id: "u1", status: "verified_user", deleted_at: null })).toBe(true);
    expect(isActiveMemberProfile(null)).toBe(false);
  });
});
