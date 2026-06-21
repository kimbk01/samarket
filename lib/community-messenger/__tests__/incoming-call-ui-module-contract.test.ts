import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

function exists(p: string): boolean {
  return existsSync(join(process.cwd(), p));
}

describe("incoming-call UI module (Kakao/Telegram lane)", () => {
  it("single in-app UI host + banner; no legacy full-screen host", () => {
    expect(exists("components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx")).toBe(true);
    expect(exists("components/community-messenger/ForegroundIncomingCallHost.tsx")).toBe(false);

    const ui = read("components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx");
    expect(ui).toContain("IncomingCallBanner");
    expect(ui).toContain("DO NOT: `IncomingCallView`");

    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("CommunityMessengerIncomingCallUi");
    expect(global).not.toContain("ForegroundIncomingCallHost");
    expect(global).not.toContain("CommunityMessengerIncomingCallOverlay");
    expect(global).not.toContain("expandIncomingCall");
    expect(global).not.toContain("buildIncomingCallPreviewHref");
  });

  it("CallScreen never renders legacy IncomingCallView full-screen bell", () => {
    const callScreen = read("components/messenger/call/CallScreen.tsx");
    expect(callScreen).not.toContain("IncomingCallView");
    expect(callScreen).toContain('layout === "incomingRing"');
    expect(exists("components/messenger/call/IncomingCallView.tsx")).toBe(false);
  });

  it("incoming-call lib barrel exports lane + presenter", () => {
    const barrel = read("lib/community-messenger/incoming-call/index.ts");
    expect(barrel).toContain("resolveIncomingCallLane");
    expect(barrel).toContain("resolveForegroundIncomingPresentation");
  });

  it("CallClient delegates callee ringing to boundary guards only", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("useCallClientIncomingCalleeGuards");
    expect(client).toContain("call-client-incoming-boundary");
    expect(client).not.toContain("IncomingCallView");
  });
});
