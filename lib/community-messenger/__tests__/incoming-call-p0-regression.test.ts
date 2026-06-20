import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("sw.js incoming-call wake regression", () => {
  it("community_messenger_message wake path unchanged", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain('payload.notification_type === "community_messenger_message"');
    expect(sw).toContain('type: "samarket_messenger_message_wake"');
    expect(sw).toContain("roomId: roomId");
  });

  it("incoming_call wake adds optional fields without altering message branch", () => {
    const sw = read("public/sw.js");
    const messageIdx = sw.indexOf("samarket_messenger_message_wake");
    const incomingIdx = sw.indexOf("samarket_messenger_incoming_call_wake");
    expect(messageIdx).toBeGreaterThan(-1);
    expect(incomingIdx).toBeGreaterThan(-1);
    expect(sw).toContain("callerId:");
    expect(sw).toContain("call_canceled");
  });
});

describe("call terminal navigation policy", () => {
  it("callee joins on Realtime active after server confirms (not optimistic seed only)", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("shouldJoinOnServerActive");
    expect(client).toContain("confirmServerActiveFromRealtimeActiveTransition(merged.id)");
    expect(client).toContain("void joinCall(merged)");
    expect(client).toContain("confirmServerActiveFromPatchAccept(patchedSession)");
  });

  it("outgoing accept hot path avoids stale ringing GET and skips initiator refresh", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain('prev.status === "active" && next.status === "ringing"');
    expect(client).toContain("queueMicrotask(() => {");
    expect(client).toContain("!sessionRef.current?.isMineInitiator");
    expect(client).toContain("void joinCall(merged)");
  });

  it("terminal paths use call_logs; non-terminal keeps navigateBack", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    // SSOT marker: ssot-source-contract-markers.test.ts (messenger-call-terminal-nav)
    expect(client).toContain("exitCommunityMessengerCallRouteNow");
    expect(client).toContain("beginRingingCallDismiss");
    expect(client).toContain("closeTerminalView");
    // loading cancel / ringing block still use navigateBack
    expect(client).toContain("dismissHydrate = () => navigateBackFromCommunityMessengerCall");
    expect(client).toContain("handleMinimizeToPip");
    expect(client).toContain("handleDockToOngoing");
  });

  it("accept route defers remote terminal ringing dismiss until server confirms", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(client).toContain("shouldDeferCalleeRingingTerminalDismiss");
    expect(client).toContain("call_client_remote_terminal_deferred");
    expect(client).toContain("serverConfirmedTerminal: true");
    const routeFirstBlock = global.slice(global.indexOf("incoming_banner_accept_route_first"));
    const replaceIdx = routeFirstBlock.indexOf("router.replace(`/community-messenger/calls/");
    const dismissIdx = routeFirstBlock.indexOf("dismissIncomingPresenterAfterAccept({");
    expect(replaceIdx).toBeGreaterThan(-1);
    expect(dismissIdx).toBeGreaterThan(replaceIdx);
    expect(global).toContain("acceptIncomingCallOnce");
    expect(global).toContain("?action=accept&mode=active&source=banner");
    expect(client).toContain("primeCommunityMessengerCallConnectionPrefetch(sessionId)");
    expect(client).toContain("onAcceptEntryRoute");
    const gateway = read("lib/community-messenger/incoming-call-accept-gateway.ts");
    expect(gateway).toContain("prewarmInPlaceDirectVideoCallHost");
    expect(gateway).toContain("dispatchIncomingCallAcceptActiveSession(updated)");
    expect(client).toContain("subscribeIncomingCallAcceptActiveSession");
    expect(client).toContain("void joinCall(patchedSession)");
  });

  it("native accept routes skip duplicate PATCH in CallClient", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("nativePrepRoute && requestedActionRef.current === \"accept\"");
    expect(client).toContain("nativeAcceptCompletedRoute && requestedActionRef.current === \"accept\"");
    expect(client).toContain("accept_route_prep_enter");
    expect(client).not.toMatch(
      /nativeAcceptCompletedRoute[\s\S]{0,400}patchCommunityMessengerCallSession\([^)]*,\s*\"accept\"/
    );
    expect(client).not.toMatch(
      /nativePrepRoute[\s\S]{0,400}patchCommunityMessengerCallSession\([^)]*,\s*\"accept\"/
    );
  });
});
