import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-engine lockdown contract", () => {
  it("keeps lifecycle PATCH out of UI components", () => {
    const callClient = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const globalIncoming = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(callClient).not.toContain('patchCommunityMessengerCallSession(');
    expect(globalIncoming).not.toContain('patchCommunityMessengerCallSession(');
  });

  it("blocks native direct peer PATCH", () => {
    const incomingCoordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(incomingCoordinator).not.toContain("CallSessionPatchHelper.patch");
    expect(fgs).not.toContain("CallSessionPatchHelper.patch");
  });

  it("removes foreground native pill owner", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher.showUi");
  });

  it("keeps chat room layer free from lifecycle patch", () => {
    const roomLayer = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2CallLayer.tsx");
    expect(roomLayer).not.toContain("patchCommunityMessengerCallSession");
    expect(roomLayer).not.toContain("joinCommunityMessengerAgoraChannelOnce");
    expect(roomLayer).not.toContain("runCallEndGuard");
    expect(roomLayer).not.toContain("runCallAcceptGuard");
  });

  it("blocks CallClient raw lifecycle PATCH fetch", () => {
    const callClient = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(callClient).not.toMatch(
      /fetch\([`'"].*\/api\/community-messenger\/calls\/sessions\/[^`'"]+[`'"][\s\S]{0,500}?method:\s*["']PATCH["'][\s\S]{0,500}?action:\s*["'](?:accept|reject|cancel|end|missed)["']/
    );
    expect(callClient).toContain("callEngineActions.patch");
  });
});
