import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import { MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS } from "@/lib/community-messenger/incoming-call-surface";
import { resolveForegroundIncomingPresentation } from "@/lib/community-messenger/incoming-call/foreground-incoming-presenter";

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
      preferNativeAndroidForegroundIncoming: false,
    });

    expect(decision.shouldRender).toBe(true);
    expect(decision.sessionId).toBe("call-b");
    expect(decision.reason).toBe("ok");
  });

  it("suppresses web banner when native Android foreground pill is active", () => {
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
      capacitorAppActive: true,
      preferNativeAndroidForegroundIncoming: true,
      nativeForegroundIncomingCallId: "call-1",
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("native_foreground_pill_active");
  });

  it("always suppresses web banner on Android foreground (native pill is sole surface)", () => {
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
      capacitorAppActive: true,
      preferNativeAndroidForegroundIncoming: true,
      nativeForegroundIncomingCallId: null,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("native_foreground_primary");
  });

  it("suppresses web banner when app is background on Capacitor", () => {
    const incoming = ringingSession("call-1");
    const decision = resolveForegroundIncomingPresentation({
      sessions: [incoming],
      pathname: "/community-messenger",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "hidden",
      isCapacitorNative: true,
      capacitorAppActive: false,
      preferNativeAndroidForegroundIncoming: true,
    });

    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("native_background_or_lock");
  });

  it("ForegroundIncomingCallHost uses body portal and banner z layer", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/ForegroundIncomingCallHost.tsx"),
      "utf8"
    );
    expect(src).toContain("createPortal");
    expect(src).toContain("MESSENGER_FOREGROUND_INCOMING_BANNER_Z_CLASS");
    expect(src).toContain("data-foreground-incoming-call-host");
  });
});
