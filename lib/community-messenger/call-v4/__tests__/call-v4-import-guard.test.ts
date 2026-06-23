import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v4 import isolation", () => {
  it("call-v4 modules do not import call-v3 actions or provider", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).not.toContain("call-v3-actions");
    expect(screen).not.toContain("CallV3Provider");
    expect(screen).not.toContain("callV3Accept");
    expect(screen).not.toContain("exitCallV3ScreenAfterCleanup");
  });

  it("CallV4Screen logs required Phase 1 markers", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).toContain("screen_mounted");
    expect(screen).toContain("connecting_visible");
  });

  it("CallIncomingChrome gates V4 before V3", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("isCallV4TelegramLaneEnabled()");
    expect(chrome).toMatch(
      /if \(isCallV4TelegramLaneEnabled\(\)\)[\s\S]*?if \(isDibayCallV3SafeLaneEnabled\(\)\)/
    );
  });

  it("PushRouteListener suppresses V3 call routes when V4 lane ON", () => {
    const listener = read("components/push/PushRouteListener.tsx");
    expect(listener).toContain("isCallV4TelegramLaneEnabled()");
    expect(listener).toContain("v3_call_route_suppressed");
    expect(listener).toMatch(
      /if \(isCallV4TelegramLaneEnabled\(\) && isCallRoute\(path\)\)[\s\S]*?return;/
    );
  });

  it("MainActivity suppresses V3 wake/persist when V4 lane ON", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("CallV4Lane.shouldSuppressV3CallReplay");
    expect(main).toContain("v3_wake_route_suppressed");
    expect(main).toContain("v3_pending_route_suppressed");
    expect(main).toContain("v3_incoming_web_suppressed");
  });

  it("CallForegroundService routes FGS accept through coordinator when V4 ON", () => {
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(fgs).toContain("resolveRingingNotificationAcceptIntent");
    expect(fgs).toContain("buildCoordinatorAcceptIntent");
    expect(fgs).toContain("v3_task_removed_pending_suppressed");
  });

  it("IncomingCallActionCoordinator uses V4 logs without accept_pending_web on V4 path", () => {
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coord).toContain("[DIBAY_CALL_V4] accept_start");
    expect(coord).toMatch(/if \(v4Lane\)[\s\S]*?accept_start[\s\S]*?else[\s\S]*?accept_pending_web/);
  });
});
