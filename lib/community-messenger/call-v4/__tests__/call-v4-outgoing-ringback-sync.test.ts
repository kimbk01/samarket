import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  startOutgoingRingback: vi.fn(),
  stopOutgoingRingback: vi.fn(),
}));

import {
  startOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";
import {
  CALL_V4_OUTGOING_RINGBACK_SOURCE,
  syncCallV4OutgoingRingback,
} from "@/lib/community-messenger/call-v4/call-v4-outgoing-ringback-sync";
import { resetWebOutgoingRingbackOwnershipForTests } from "@/lib/community-messenger/call-outgoing-ringback-ownership";

describe("call-v4-outgoing-ringback-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebOutgoingRingbackOwnershipForTests();
  });

  it("starts ringback once for outgoing_ringing + outgoing + outgoing presentation", () => {
    syncCallV4OutgoingRingback({
      callId: "call-a",
      phase: "outgoing_ringing",
      direction: "outgoing",
      mediaType: "audio",
      outgoingPresentation: true,
    });
    expect(startOutgoingRingback).toHaveBeenCalledTimes(1);
    expect(startOutgoingRingback).toHaveBeenCalledWith({
      callId: "call-a",
      kind: "voice",
      source: CALL_V4_OUTGOING_RINGBACK_SOURCE,
    });
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("does not start for incoming direction", () => {
    syncCallV4OutgoingRingback({
      callId: "call-a",
      phase: "outgoing_ringing",
      direction: "incoming",
      mediaType: "audio",
      outgoingPresentation: true,
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("does not start when outgoing presentation source is false", () => {
    syncCallV4OutgoingRingback({
      callId: "call-a",
      phase: "outgoing_ringing",
      direction: "outgoing",
      mediaType: "audio",
      outgoingPresentation: false,
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("uses video kind for video mediaType", () => {
    syncCallV4OutgoingRingback({
      callId: "call-v",
      phase: "outgoing_ringing",
      direction: "outgoing",
      mediaType: "video",
      outgoingPresentation: true,
    });
    expect(startOutgoingRingback).toHaveBeenCalledWith({
      callId: "call-v",
      kind: "video",
      source: CALL_V4_OUTGOING_RINGBACK_SOURCE,
    });
  });

  it.each([
    "connected",
    "ended",
    "missed",
    "joining",
    "accepting",
    "ending",
    "cancelled",
    "rejected",
    "failed",
    "idle",
  ] as const)("stops ringback on phase %s", (phase) => {
    syncCallV4OutgoingRingback({
      callId: "call-a",
      phase,
      direction: "outgoing",
      mediaType: "audio",
      outgoingPresentation: true,
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).toHaveBeenCalledWith("call-a", `call_v4_phase_${phase}`);
  });
});
