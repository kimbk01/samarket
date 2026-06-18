import { describe, expect, it, vi, beforeEach } from "vitest";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";

const openLoginRequiredSheet = vi.fn();
const openPhoneVerificationRequiredSheet = vi.fn();

vi.mock("@/lib/auth/require-auth-action", () => ({
  openLoginRequiredSheet: (...args: unknown[]) => openLoginRequiredSheet(...args),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: (...args: unknown[]) => openPhoneVerificationRequiredSheet(...args),
}));

describe("redirectForBlockedAction", () => {
  const router = { push: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens login sheet for login required errors", () => {
    const ok = redirectForBlockedAction(router, "로그인이 필요합니다.", "/community-messenger/rooms/x");
    expect(ok).toBe(true);
    expect(openLoginRequiredSheet).toHaveBeenCalledWith({
      actionType: "messenger_open",
      next: "/community-messenger/rooms/x",
    });
    expect(openPhoneVerificationRequiredSheet).not.toHaveBeenCalled();
  });

  it("opens phone verification sheet for PHONE_VERIFICATION_REQUIRED", () => {
    const ok = redirectForBlockedAction(router, "PHONE_VERIFICATION_REQUIRED", "/community-messenger/rooms/x");
    expect(ok).toBe(true);
    expect(openPhoneVerificationRequiredSheet).toHaveBeenCalledWith({
      next: "/community-messenger/rooms/x",
    });
    expect(openLoginRequiredSheet).not.toHaveBeenCalled();
  });

  it("opens phone verification sheet for gate message text", () => {
    const ok = redirectForBlockedAction(router, "전화번호 인증 후 이용할 수 있습니다.", "/community-messenger");
    expect(ok).toBe(true);
    expect(openPhoneVerificationRequiredSheet).toHaveBeenCalled();
  });

  it("returns false for unrelated errors", () => {
    const ok = redirectForBlockedAction(router, "room_not_found", "/community-messenger");
    expect(ok).toBe(false);
    expect(openLoginRequiredSheet).not.toHaveBeenCalled();
    expect(openPhoneVerificationRequiredSheet).not.toHaveBeenCalled();
  });
});
