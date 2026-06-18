import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertPhoneVerifiedForMessengerActionOrOpenSheet,
  clientProfilePassesPhoneVerification,
} from "@/lib/auth/assert-phone-verified-for-messenger-action-client";

const getCurrentUser = vi.fn();
const openPhoneVerificationRequiredSheet = vi.fn();

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => getCurrentUser(),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: (...args: unknown[]) => openPhoneVerificationRequiredSheet(...args),
}));

describe("assertPhoneVerifiedForMessengerActionOrOpenSheet", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    openPhoneVerificationRequiredSheet.mockReset();
  });

  it("passes when phone is verified", () => {
    getCurrentUser.mockReturnValue({ id: "u1", phone_verified: true });
    expect(clientProfilePassesPhoneVerification(getCurrentUser())).toBe(true);
    expect(assertPhoneVerifiedForMessengerActionOrOpenSheet("/community-messenger/rooms/x")).toBe(true);
    expect(openPhoneVerificationRequiredSheet).not.toHaveBeenCalled();
  });

  it("opens sheet when phone is not verified", () => {
    getCurrentUser.mockReturnValue({ id: "u1", phone_verified: false, role: "user" });
    expect(assertPhoneVerifiedForMessengerActionOrOpenSheet("/community-messenger/rooms/x")).toBe(false);
    expect(openPhoneVerificationRequiredSheet).toHaveBeenCalledWith({
      next: "/community-messenger/rooms/x",
    });
  });
});
