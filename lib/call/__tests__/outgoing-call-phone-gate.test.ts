import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardInstantOutgoingCallStart } from "@/lib/call/outgoing-call-start-guard";

const getCurrentUser = vi.fn();
const openPhoneVerificationRequiredSheet = vi.fn();

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => getCurrentUser(),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: (...args: unknown[]) => openPhoneVerificationRequiredSheet(...args),
}));

describe("guardInstantOutgoingCallStart phone gate", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    openPhoneVerificationRequiredSheet.mockReset();
  });

  it("blocks unverified users with phoneVerificationRequired", () => {
    getCurrentUser.mockReturnValue({ id: "u1", phone_verified: false, role: "user" });
    const guard = guardInstantOutgoingCallStart({ roomId: "room-1", kind: "voice" });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.phoneVerificationRequired).toBe(true);
    }
    expect(openPhoneVerificationRequiredSheet).toHaveBeenCalled();
  });
});
