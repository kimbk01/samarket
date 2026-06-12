import { describe, expect, it } from "vitest";
import {
  isAccountDependentPath,
  sanitizeLoginNextPath,
  shouldDenyFreshLoginLanding,
} from "@/lib/auth/auth-route-classification";

describe("auth-route-classification", () => {
  it("marks messenger rooms as account-dependent", () => {
    expect(isAccountDependentPath("/community-messenger/rooms/abc")).toBe(true);
    expect(isAccountDependentPath("/community-messenger")).toBe(false);
  });

  it("denies fresh login landing for deep links", () => {
    expect(shouldDenyFreshLoginLanding("/community-messenger/rooms/abc")).toBe(true);
    expect(shouldDenyFreshLoginLanding("/community-messenger")).toBe(false);
  });

  it("sanitizeLoginNextPath rejects account-dependent next", () => {
    expect(sanitizeLoginNextPath("/community-messenger/rooms/abc")).toBeNull();
    expect(sanitizeLoginNextPath("/philife")).toBe("/philife");
  });
});
