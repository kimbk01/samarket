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
  it("single in-app UI host + surface; no legacy full-screen host", () => {
    expect(exists("components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx")).toBe(true);
    expect(exists("components/community-messenger/ForegroundIncomingCallHost.tsx")).toBe(false);

    const ui = read("components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx");
    expect(ui).toContain("IncomingCallSurface");
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

  it("incoming call UI lives under call/incoming with IncomingCallButton SSOT", () => {
    expect(exists("components/messenger/call/incoming/IncomingCallSurface.tsx")).toBe(true);
    expect(exists("components/messenger/call/incoming/IncomingCallPopup.tsx")).toBe(true);
    expect(exists("components/messenger/call/incoming/IncomingCallFullScreen.tsx")).toBe(true);
    expect(exists("components/messenger/call/incoming/IncomingCallButton.tsx")).toBe(true);
    expect(exists("components/messenger/call/IncomingCallBanner.tsx")).toBe(false);

    const ui = read("components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx");
    expect(ui).toContain("@/components/messenger/call/incoming");

    const popup = read("components/messenger/call/incoming/IncomingCallPopup.tsx");
    expect(popup).toContain("incoming-call-popup__card");

    const controls = read("components/messenger/call/incoming/IncomingCallControls.tsx");
    expect(controls).toContain("IncomingCallButton");

    const css = read("app/samarket-components.css");
    expect(css).toContain("incoming-call-popup--enter");
    expect(css).toContain("370ms");
    expect(css).toContain("incoming-call-popup__card");
    expect(css).toContain("incoming-call-controls--compact");
    expect(css).toMatch(/gap:\s*max\(20px/);
    expect(css).toContain("#34c759");
    expect(css).toContain("#ff3b30");
    expect(css).toContain("incoming-call-btn--large");
    expect(css).toMatch(/width:\s*72px/);
    expect(css).toMatch(/gap:\s*max\(48px/);
  });

  it("incoming call UI tree does not call getUserMedia before accept", () => {
    const paths = [
      "components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx",
      "components/community-messenger/incoming-call/CommunityMessengerIncomingCallUi.tsx",
      "components/messenger/call/incoming/IncomingCallSurface.tsx",
      "components/messenger/call/incoming/IncomingCallPopup.tsx",
      "components/messenger/call/incoming/IncomingCallFullScreen.tsx",
      "components/messenger/call/incoming/IncomingCallControls.tsx",
      "components/messenger/call/incoming/IncomingCallButton.tsx",
    ];
    for (const p of paths) {
      expect(read(p)).not.toContain("getUserMedia");
    }
  });
});
