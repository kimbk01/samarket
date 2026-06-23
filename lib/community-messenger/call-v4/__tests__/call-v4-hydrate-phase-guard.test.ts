/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: vi.fn(),
}));

import {
  hydrateCallV4CalleeScreen,
  shouldHydrateOverwriteCallV4Phase,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(callId: string): CommunityMessengerCallSession {
  return {
    id: callId,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    startedAt: new Date().toISOString(),
  } as CommunityMessengerCallSession;
}

describe("shouldHydrateOverwriteCallV4Phase", () => {
  it("blocks overwrite for accepting, joining, connected on ringing session", () => {
    expect(shouldHydrateOverwriteCallV4Phase("joining", "ringing")).toBe(false);
    expect(shouldHydrateOverwriteCallV4Phase("accepting", "ringing")).toBe(false);
    expect(shouldHydrateOverwriteCallV4Phase("connected", "ringing")).toBe(false);
  });

  it("allows overwrite for idle and incoming_ringing on ringing session", () => {
    expect(shouldHydrateOverwriteCallV4Phase("idle", "ringing")).toBe(true);
    expect(shouldHydrateOverwriteCallV4Phase("incoming_ringing", "ringing")).toBe(true);
  });
});

describe("hydrateCallV4CalleeScreen phase guard", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    vi.mocked(callV4FetchSession).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it.each([
    ["joining", "joining"],
    ["accepting", "accepting"],
    ["connected", "connected"],
  ] as const)("preserves currentPhase=%s when session is still ringing", async (phase, expected) => {
    useCallV4Store.getState().setPhase(phase);
    vi.mocked(callV4FetchSession).mockResolvedValue(ringingSession("call-guard"));

    const hydrated = await hydrateCallV4CalleeScreen("call-guard");
    expect(hydrated).toBe(true);
    expect(useCallV4Store.getState().phase).toBe(expected);
    expect(console.info).toHaveBeenCalledWith(
      "[DIBAY_CALL_V4]",
      "hydrate_phase_preserved",
      expect.objectContaining({
        callId: "call-guard",
        sessionStatus: "ringing",
        currentPhase: phase,
      }),
    );
  });

  it("sets incoming_ringing from idle when session is ringing", async () => {
    useCallV4Store.getState().setPhase("idle");
    vi.mocked(callV4FetchSession).mockResolvedValue(ringingSession("call-idle"));

    await hydrateCallV4CalleeScreen("call-idle");
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");
  });

  it("keeps incoming_ringing when session is ringing", async () => {
    useCallV4Store.getState().setPhase("incoming_ringing");
    vi.mocked(callV4FetchSession).mockResolvedValue(ringingSession("call-ring"));

    await hydrateCallV4CalleeScreen("call-ring");
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");
  });
});
