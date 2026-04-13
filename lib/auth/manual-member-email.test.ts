import { describe, expect, it } from "vitest";
import {
  buildManualMemberAuthEmail,
  MANUAL_MEMBER_EMAIL_DOMAIN,
  resolveManualMemberSignInEmail,
} from "./manual-member-email";

describe("manual-member-email", () => {
  it("buildManualMemberAuthEmail lowercases and appends domain", () => {
    expect(buildManualMemberAuthEmail("  ZxZx33 ")).toBe(`zxzx33@${MANUAL_MEMBER_EMAIL_DOMAIN}`);
  });

  it("resolveManualMemberSignInEmail passes real emails through", () => {
    expect(resolveManualMemberSignInEmail("User@Example.com")).toBe("user@example.com");
  });

  it("resolveManualMemberSignInEmail maps bare id to manual email", () => {
    expect(resolveManualMemberSignInEmail("aaaa")).toBe(`aaaa@${MANUAL_MEMBER_EMAIL_DOMAIN}`);
  });
});
