import { describe, expect, it, vi, beforeEach } from "vitest";
import { tryRedirectMessengerRoomAuthBlocked } from "@/lib/community-messenger/room/messenger-room-auth-blocked-redirect";

const redirectForBlockedAction = vi.fn();

vi.mock("@/lib/auth/client-access-flow", () => ({
  redirectForBlockedAction: (...args: unknown[]) => redirectForBlockedAction(...args),
}));

describe("tryRedirectMessengerRoomAuthBlocked", () => {
  const router = { push: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects phone verification without duplicate snackbar path", () => {
    redirectForBlockedAction.mockReturnValue(true);
    const res = new Response(null, { status: 403 });
    const ok = tryRedirectMessengerRoomAuthBlocked(
      router,
      res,
      { code: "PHONE_VERIFICATION_REQUIRED", error: "전화번호 인증 후 이용할 수 있습니다." },
      { pathname: "/community-messenger/rooms/room-1", streamRoomId: "room-1" }
    );
    expect(ok).toBe(true);
    expect(redirectForBlockedAction).toHaveBeenCalledTimes(1);
    expect(redirectForBlockedAction).toHaveBeenCalledWith(
      router,
      "PHONE_VERIFICATION_REQUIRED",
      "/community-messenger/rooms/room-1"
    );
  });

  it("passes login error text through single redirect handler", () => {
    redirectForBlockedAction.mockReturnValue(true);
    const res = new Response(null, { status: 401 });
    const ok = tryRedirectMessengerRoomAuthBlocked(
      router,
      res,
      { error: "unauthorized" },
      { pathname: "/community-messenger", streamRoomId: null }
    );
    expect(ok).toBe(true);
    expect(redirectForBlockedAction).toHaveBeenCalledTimes(1);
  });

  it("returns false when redirect handler does not match", () => {
    redirectForBlockedAction.mockReturnValue(false);
    const res = new Response(null, { status: 400 });
    const ok = tryRedirectMessengerRoomAuthBlocked(
      router,
      res,
      { error: "room_not_found" },
      { pathname: "/community-messenger/rooms/x", streamRoomId: "x" }
    );
    expect(ok).toBe(false);
  });
});
