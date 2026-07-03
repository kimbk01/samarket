import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  patchMissed: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/call/native/legacy-web-call-establishment-removed", () => ({
  isLegacyWebCallEstablishmentRemoved: vi.fn(() => true),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4CreateSession: vi.fn(),
  callV4FetchSession: apiMocks.fetchSession,
  callV4PatchMissed: apiMocks.patchMissed,
  callV4PatchAccept: vi.fn(),
  callV4PatchCancel: vi.fn(),
  callV4PatchEnd: vi.fn(),
  callV4PatchReject: vi.fn(),
  callV4ReconcileBeforeCreate: vi.fn(),
  callV4ResolveOutgoingRoomId: vi.fn(),
  callV4MediaTypeFromKind: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: vi.fn(async () => undefined),
}));

import { callV4HandleMissedTimeout } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4 missed timeout eligibility", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    apiMocks.fetchSession.mockReset();
    apiMocks.patchMissed.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("skips missed timeout when phase is connected even with native scheduled fire context", async () => {
    useCallV4Store.setState({
      phase: "connected",
      connectedAt: Date.now(),
      identity: {
        callId: "call-connected",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "video",
        createdAt: new Date().toISOString(),
      },
    });

    await callV4HandleMissedTimeout("call-connected", "outgoing:no_answer", undefined, {
      callId: "call-connected",
      direction: "outgoing",
      scheduledPhase: "outgoing_ringing",
    });

    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    expect(apiMocks.patchMissed).not.toHaveBeenCalled();
  });
});
