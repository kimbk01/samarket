import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertPhoneVerifiedForMessengerActionOrOpenSheet,
  clientProfilePassesPhoneVerification,
} from "@/lib/auth/assert-phone-verified-for-messenger-action-client";

const getCurrentUser = vi.fn();
const openPhoneVerificationRequiredSheet = vi.fn();
const isClientSignupComplete = vi.fn(() => true);

vi.mock("@/lib/auth/client-signup-gate", () => ({
  isClientSignupComplete: (...args: unknown[]) => isClientSignupComplete(...(args as [])),
}));

vi.mock("@/lib/auth/client-access-flow", () => ({
  buildConsentHref: (next?: string) => `/auth/onboarding/terms?next=${encodeURIComponent(next ?? "")}`,
}));

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
    isClientSignupComplete.mockReset();
    isClientSignupComplete.mockReturnValue(true);
    vi.unstubAllGlobals();
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

  it("P2-2: unconsented member goes to consent before the phone OTP sheet", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign, pathname: "/community-messenger", search: "" } });
    getCurrentUser.mockReturnValue({ id: "u1", phone_verified: false, role: "user" });
    isClientSignupComplete.mockReturnValue(false);
    expect(assertPhoneVerifiedForMessengerActionOrOpenSheet("/community-messenger/rooms/x")).toBe(false);
    expect(openPhoneVerificationRequiredSheet).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      `/auth/onboarding/terms?next=${encodeURIComponent("/community-messenger/rooms/x")}`,
    );
  });
});
