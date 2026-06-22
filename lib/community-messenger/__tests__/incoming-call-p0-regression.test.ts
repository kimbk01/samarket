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
  it("terminal paths use call_logs and release local lifecycle SSOT", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const seed = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(client).toContain("finalizeCommunityMessengerCallTerminalExit");
    expect(client).toContain("releaseLocalCallLifecycleForTerminalSync");
    expect(seed).toContain("releaseLocalCallLifecycleForTerminalSync");
    expect(client).toContain("beginRingingCallDismiss");
    expect(client).toContain("closeTerminalView");
    // loading cancel / ringing block / pip minimize still use navigateBack
    expect(client).toContain("dismissHydrate = () => navigateBackFromCommunityMessengerCall");
    expect(client).toContain("handleMinimizeToPip");
    expect(client).toContain("navigateBackFromCommunityMessengerCall(router, s.roomId)");
  });

  it("nativeAccept=1 skips duplicate PATCH in CallClient", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("nativeAcceptRoute && requestedActionRef.current === \"accept\"");
    expect(client).not.toMatch(
      /nativeAcceptRoute[\s\S]{0,400}patchCommunityMessengerCallSession\([^)]*,\s*\"accept\"/
    );
  });
});
