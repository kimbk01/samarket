/**
 * Cross-platform 1:1 call surface authority contract (static + unit).
 * Native owns ringing; WebView banner/ringtone/stub suppressed on Capacitor;
 * messenger history is terminal-only; missed Bell is callee-only.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveForegroundIncomingPresentation } from "@/lib/community-messenger/incoming-call/foreground-incoming-presenter";
import { CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT } from "@/lib/community-messenger/call-v4/call-v4-telegram-incoming-surface";
import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const ROOT = path.resolve(__dirname, "../../..");

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function ringingSession(partial?: Partial<CommunityMessengerCallSession>): CommunityMessengerCallSession {
  return {
    id: "sess-ring-1",
    roomId: "room-1",
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    sessionMode: "direct",
    status: "ringing",
    startedAt: "2026-07-29T02:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
    ...partial,
  };
}

describe("cross-platform native incoming authority (static)", () => {
  it("Android Native Runtime claims IncomingCallSurfaceOwner on handleIncoming", () => {
    const voice = readRepo("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java");
    const video = readRepo("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java");
    expect(voice).toContain("IncomingCallSurfaceOwner.tryClaimIncomingOwner");
    expect(voice).toContain("native_voice_runtime_incoming");
    expect(video).toContain("IncomingCallSurfaceOwner.tryClaimIncomingOwner");
    expect(video).toContain("native_video_runtime_incoming");
  });

  it("IncomingCallActionCoordinator routes video accept/reject to NativeVideoCallRuntime", () => {
    const coord = readRepo("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coord).toContain("NativeVideoCallOwner.isNativeOwned");
    expect(coord).toContain("NativeVideoCallRuntime.accept");
    expect(coord).toContain("NativeVideoCallRuntime.reject");
  });

  it("Capacitor chrome never mounts Legacy/V3 Web establishment when native shell", () => {
    const chrome = readRepo("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("isLegacyWebCallEstablishmentRemoved");
    expect(chrome).toContain("CallV4IncomingChrome");
    const provider = readRepo("components/community-messenger/call-v4/CallV4Provider.tsx");
    expect(provider).toContain("syncOnly");
    expect(provider).toMatch(/if \(syncOnly\) \{\s*return <>\{children\}<\/>;/);
  });

  it("1:1 start does not publish dialing stub or caller ringing tip", () => {
    const service = readRepo("lib/community-messenger/service.ts");
    expect(service).toContain("do NOT publish in-flight dialing call_stub on start");
    const seed = readRepo("lib/community-messenger/call-session-navigation-seed.ts");
    expect(seed).not.toContain("outgoing_started");
    expect(seed).toContain("ringing mid-call tip/stub is Native UI only");
  });

  it("VoIP dispatch is critical-path (no after-hook deferral)", () => {
    const route = readRepo("app/api/community-messenger/rooms/[roomId]/calls/route.ts");
    expect(route).toContain("dispatchIncomingCallVoipOnCriticalPath");
    expect(route).not.toMatch(/after\s*\(\s*async/);
  });

  it("documents Capacitor native vs web desktop surfaces", () => {
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.capacitorNativeForeground).toBe(
      "native_incoming_surface"
    );
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.webDesktopForeground).toBe("web_top_banner");
  });
});

describe("WebView ringing banner suppress under native authority", () => {
  it("suppresses top-banner when suppressWebIncomingBannerForNativeAuthority", () => {
    const decision = resolveForegroundIncomingPresentation({
      sessions: [ringingSession()],
      pathname: "/community-messenger",
      viewerUserId: "callee",
      viewerLiveSessionId: null,
      tombstone: buildCallTombstoneContext(new Map()),
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
      suppressWebIncomingBannerForNativeAuthority: true,
    });
    expect(decision.shouldRender).toBe(false);
    expect(decision.reason).toBe("native_incoming_authority_suppresses_web_banner");
  });

  it("allows top-banner on pure web when native authority flag is false", () => {
    const decision = resolveForegroundIncomingPresentation({
      sessions: [ringingSession()],
      pathname: "/community-messenger",
      viewerUserId: "callee",
      viewerLiveSessionId: null,
      tombstone: buildCallTombstoneContext(new Map()),
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
      suppressWebIncomingBannerForNativeAuthority: false,
      preferNativeAndroidForegroundIncoming: true,
    });
    expect(decision.shouldRender).toBe(true);
    expect(decision.surface).toBe("top-banner");
  });
});
