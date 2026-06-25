import { describe, expect, it, beforeEach } from "vitest";
import {
  beginCallV4CalleeScreenHydrate,
  endCallV4CalleeScreenHydrate,
  evaluateCallV4ConnectedGate,
  isCallV4ConnectedMediaPrerequisiteMet,
  markCallV4AcceptPatchJoinableInflight,
  resetCallV4ConnectedGateForTests,
  shouldSuppressCallV4StaleRouteExit,
} from "@/lib/community-messenger/call-v4/call-v4-connected-gate";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

const ACTIVE_PHASES = new Set<CallV4Phase>([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
  "connected",
  "ending",
]);

function baseInput(overrides: Partial<Parameters<typeof evaluateCallV4ConnectedGate>[0]> = {}) {
  return {
    callId: "call-1",
    identityCallId: "call-1",
    mediaType: "audio" as const,
    storePhase: "joining" as const,
    sessionStatus: "active",
    acceptPatchJoinableInflight: false,
    agoraJoinSuccess: true,
    remoteAudioSubscribed: false,
    localVideoPublishDone: false,
    direction: "incoming" as const,
    ...overrides,
  };
}

describe("call-v4-connected-gate", () => {
  beforeEach(() => {
    resetCallV4ConnectedGateForTests();
  });

  it("audio gate passes on agora join success without remote video", () => {
    const result = evaluateCallV4ConnectedGate(baseInput({ mediaType: "audio" }));
    expect(result).toEqual({ pass: true });
  });

  it("video gate passes without remote_video_track_ready when local publish done", () => {
    const result = evaluateCallV4ConnectedGate(
      baseInput({
        mediaType: "video",
        localVideoPublishDone: true,
        remoteAudioSubscribed: false,
      }),
    );
    expect(result).toEqual({ pass: true });
  });

  it("video gate fails without local_video_publish_done", () => {
    const result = evaluateCallV4ConnectedGate(
      baseInput({
        mediaType: "video",
        localVideoPublishDone: false,
      }),
    );
    expect(result).toEqual({ pass: false, reason: "video_local_publish_not_ready" });
  });

  it("remote video readiness is not a gate prerequisite", () => {
    expect(
      isCallV4ConnectedMediaPrerequisiteMet({
        mediaType: "video",
        agoraJoinSuccess: true,
        remoteAudioSubscribed: false,
        localVideoPublishDone: true,
      }),
    ).toBe(true);
  });

  it("identity mismatch fails", () => {
    const result = evaluateCallV4ConnectedGate(baseInput({ identityCallId: "other" }));
    expect(result).toEqual({ pass: false, reason: "identity_mismatch" });
  });

  it("session non-active fails for incoming without in-flight window", () => {
    const result = evaluateCallV4ConnectedGate(
      baseInput({
        sessionStatus: "ringing",
        direction: "incoming",
        storePhase: "incoming_ringing",
      }),
    );
    expect(result).toEqual({ pass: false, reason: "session_not_joinable" });
  });

  it("accept patch joinable in-flight allows ringing session while joining", () => {
    markCallV4AcceptPatchJoinableInflight("call-1");
    const result = evaluateCallV4ConnectedGate(
      baseInput({
        sessionStatus: "ringing",
        acceptPatchJoinableInflight: true,
      }),
    );
    expect(result).toEqual({ pass: true });
  });

  it("join not ready fails", () => {
    const result = evaluateCallV4ConnectedGate(baseInput({ agoraJoinSuccess: false }));
    expect(result).toEqual({ pass: false, reason: "agora_join_not_ready" });
  });

  it("suppresses stale-route exit while callee hydrate is in-flight", () => {
    beginCallV4CalleeScreenHydrate("call-1");
    expect(
      shouldSuppressCallV4StaleRouteExit({
        routeCallId: "call-1",
        hydrateInflight: true,
        afterIdentityCallId: null,
        afterPhase: "idle",
        activePhases: ACTIVE_PHASES,
      }),
    ).toBe(true);
    endCallV4CalleeScreenHydrate("call-1");
  });
});
