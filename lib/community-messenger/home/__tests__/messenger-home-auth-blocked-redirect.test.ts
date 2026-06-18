import { describe, expect, it, vi, beforeEach } from "vitest";
import { tryRedirectMessengerHomeAuthBlocked } from "@/lib/community-messenger/home/messenger-home-auth-blocked-redirect";

const redirectForBlockedAction = vi.fn();

vi.mock("@/lib/auth/client-access-flow", () => ({
  redirectForBlockedAction: (...args: unknown[]) => redirectForBlockedAction(...args),
}));

describe("tryRedirectMessengerHomeAuthBlocked", () => {
  const router = { push: vi.fn() };

  beforeEach(() => {
    redirectForBlockedAction.mockReset();
    redirectForBlockedAction.mockReturnValue(true);
  });

  it("redirects on PHONE_VERIFICATION_REQUIRED code without relying on error text", () => {
    const ok = tryRedirectMessengerHomeAuthBlocked(
      router,
      new Response(null, { status: 403 }),
      { code: "PHONE_VERIFICATION_REQUIRED", error: "unexpected body" },
      { nextPath: "/community-messenger", loginRequiredMessage: "Login required" }
    );
    expect(ok).toBe(true);
    expect(redirectForBlockedAction).toHaveBeenCalledWith(
      router,
      "PHONE_VERIFICATION_REQUIRED",
      "/community-messenger"
    );
  });

  it("falls back to error text for login gate", () => {
    tryRedirectMessengerHomeAuthBlocked(
      router,
      new Response(null, { status: 401 }),
      { error: "로그인이 필요합니다." },
      { nextPath: "/community-messenger", loginRequiredMessage: "Login required" }
    );
    expect(redirectForBlockedAction).toHaveBeenCalledWith(
      router,
      "로그인이 필요합니다.",
      "/community-messenger"
    );
  });
});
