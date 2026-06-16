import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call policy contracts", () => {
  it("foreground incoming UI is banner-only (no legacy overlay, no native_auto_fullscreen)", () => {
    const src = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(src).toContain("IncomingCallBanner");
    expect(src).not.toContain("CommunityMessengerIncomingCallOverlay");
    expect(src).not.toContain("native_auto_fullscreen");
  });

  it("accept gateway is the only accept PATCH owner", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("runIncomingCallAccept");
    // Global may still PATCH for reject or group-call accept, but direct 1:1 accept must not patch here.
    expect(global).not.toContain('patchCommunityMessengerCallSession(session.id, "accept"');
    expect(global).not.toContain('patchCommunityMessengerCallSession(\n              session.id,\n              "accept"');
  });

  it("CallClient blocks callee ringing direct entry without action=accept", () => {
    const src = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(src).toContain("수락 전 자동 `/calls/:id` 진입 차단");
    expect(src).toContain("navigateBackFromCommunityMessengerCall");
  });

  it("CallClient does not re-run accept PATCH on nativeAccept=1 route", () => {
    const src = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(src).toContain("requestedActionRef.current === \"accept\"");
    expect(src).toContain("PATCH 를 재실행하지 않는다");
  });

  it("RouteHost consumes pending call route on resume", () => {
    const src = read("components/layout/providers/DibayFcmCallRouteHost.tsx");
    expect(src).toContain("visibilitychange");
    expect(src).toContain("maybeConsumeOnResume");
  });
});

