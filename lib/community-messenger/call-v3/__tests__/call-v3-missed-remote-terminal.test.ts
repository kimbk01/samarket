import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
  startCallV3Ringtone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

import { callV3HandleRemoteTerminal } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { resetCallV3IncomingDismissedForTests } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-missed-remote-terminal", () => {
  beforeEach(() => {
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    vi.mocked(stopCallV3Ringtone).mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("remote missed closes receiver banner and stops ringtone", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canReceiveNewCall: false,
    });

    await callV3HandleRemoteTerminal("call-1", "missed");

    expect(stopCallV3Ringtone).toHaveBeenCalledWith("remote_terminal");
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
  });
});
