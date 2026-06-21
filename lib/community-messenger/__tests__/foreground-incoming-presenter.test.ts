import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";
import { resolveForegroundIncomingPresentation } from "@/lib/community-messenger/incoming-call/foreground-incoming-presenter";
import {
  getIncomingCallSurfaceOwner,
  resetIncomingCallSurfaceOwner,
  claimIncomingCallSurface,
} from "@/lib/community-messenger/incoming-call-surface-owner";

function ringingSession(
  id: string,
  overrides: Partial<CommunityMessengerCallSession> = {}
): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller",
    recipientUserId: "self",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
    ...overrides,
  };
}

function activeSession(id: string): CommunityMessengerCallSession {
  return {
    ...ringingSession(id),
    status: "active",
    answeredAt: new Date().toISOString(),
  };
}

const tombstone = buildCallTombstoneContext(new Map());

describe("foreground-incoming-presenter", () => {
  beforeEach(() => {
    resetIncomingCallSurfaceOwner();
  });

  it("shows top-banner for normal foreground ringing", () => {
    const incoming = ringingSession("call-1");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.surface).toBe("top-banner");
    expect(decision.sessionId).toBe("call-1");
    expect(decision.reason).toBe("ok");
  });

  it("hides incoming on same dedicated call route", () => {
    const incoming = ringingSession("call-a");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger/calls/call-a",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.surface).toBe("none");
    expect(decision.reason).toContain("hidden_same_call_route");
  });

  it("shows top-banner for different call on dedicated route", () => {
    const incoming = ringingSession("call-b");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [activeSession("call-a"), incoming],
      pathname: "/community-messenger/calls/call-a",
      viewerUserId: "self",
      viewerLiveSessionId: "call-a",
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.surface).toBe("top-banner");
    expect(decision.sessionId).toBe("call-b");
    expect(decision.reason).toBe("ok");
  });

  it("does not busy-block stale active on previous call route", () => {
    const incoming = ringingSession("call-b");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [activeSession("call-a"), incoming],
      pathname: "/community-messenger/calls/call-a",
      viewerUserId: "self",
      viewerLiveSessionId: "call-a",
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.sessionId).toBe("call-b");
  });

  it("busy-blocks incoming when another live session blocks off call route", () => {
    const incoming = ringingSession("call-b");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [activeSession("call-a"), incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: "call-a",
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toContain("busy_auto_reject");
  });

  it("blocks terminal or consumed incoming", () => {
    const hard = new Map<string, number>([["call-ended", Date.now()]]);
    const decision = resolveForegroundIncomingPresentation({
      sessions: [ringingSession("call-ended")],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone: buildCallTombstoneContext(hard),
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("can_show_incoming_false");
  });

  it("blocks when incoming tab leader is false", () => {
    const decision = resolveForegroundIncomingPresentation({
      sessions: [ringingSession("call-1")],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: false,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("incoming_tab_leader_false");
  });

  it("keeps foreground banner z-index above CallScreenShell overlay", () => {
    expect(MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS).toBe("z-[1290]");
  });

  it("prefers foreground wake session over stale ringing on same call route", () => {
    const stale = ringingSession("call-a");
    const incoming = ringingSession("call-b", {
      startedAt: new Date(Date.now() + 5000).toISOString(),
    });
    const decision = resolveForegroundIncomingPresentation({
      sessions: [stale, incoming],
      pathname: "/community-messenger/calls/call-a",
      viewerUserId: "self",
      viewerLiveSessionId: "call-a",
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
      foregroundWakeSessionIds: new Set(["call-b"]),
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.sessionId).toBe("call-b");
    expect(decision.reason).toBe("ok");
  });

  it("suppresses web banner when native lock full-screen owns surface", () => {
    const incoming = ringingSession("call-1");
    claimIncomingCallSurface("call-1", "native_fullscreen", "test");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("surface_owner_native_fullscreen");
  });

  it("shows web top-banner on Android APK foreground (Kakao/Telegram SSOT)", () => {
    const incoming = ringingSession("call-1");
    resetIncomingCallSurfaceOwner();
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.reason).toBe("ok");
    expect(decision.surface).toBe("top-banner");
  });

  it("allows web banner on browser foreground", () => {
    const incoming = ringingSession("call-1");
    resetIncomingCallSurfaceOwner();
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.reason).toBe("ok");
  });

  it("CommunityMessengerIncomingCallUi uses body portal and banner z layer", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx"),
      "utf8"
    );
    expect(src).toContain("createPortal");
    expect(src).toContain("MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS");
    expect(src).toContain("data-cm-incoming-call-ui");
  });
});
