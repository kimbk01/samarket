import { describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_MESSENGER_CALL_LOGS_HREF,
  finalizeCommunityMessengerCallTerminalExit,
  navigateToCommunityMessengerCallLogsAfterTerminal,
} from "@/lib/community-messenger/call-session-navigation-seed";

describe("incoming-call terminal navigation", () => {
  it("navigateToCommunityMessengerCallLogsAfterTerminal always replaces to call_logs", () => {
    const router = { replace: vi.fn() };
    navigateToCommunityMessengerCallLogsAfterTerminal(router);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(COMMUNITY_MESSENGER_CALL_LOGS_HREF);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=call_logs");
  });

  it("finalizeCommunityMessengerCallTerminalExit pins surface and replaces to call_logs", () => {
    const router = { replace: vi.fn() };
    finalizeCommunityMessengerCallTerminalExit(router, "session-1", "test");
    expect(router.replace).toHaveBeenCalledWith(COMMUNITY_MESSENGER_CALL_LOGS_HREF);
  });
});
