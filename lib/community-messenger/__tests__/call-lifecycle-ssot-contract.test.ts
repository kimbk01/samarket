import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("DIBAY call lifecycle SSOT contract", () => {
  it("documents the single-owner lifecycle", () => {
    const doc = read("docs/community-messenger/call-lifecycle-ssot.md");
    expect(doc).toContain("DIBAY Call Lifecycle SSOT");
    expect(doc).toContain("runCallEndGuard");
    expect(doc).toContain("releaseLocalCallSession");
    expect(doc).toContain("Do not open `/community-messenger/calls/tmp_*`");
  });

  it("keeps CallClient media/UI only for server PATCH", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).not.toContain("patchCommunityMessengerCallSession");
    expect(client).not.toContain('method: "PATCH"');
    expect(client).not.toContain("call_client_unmount_caller_preconnect");
    expect(client).not.toContain("tmpToRealHandoff");
    expect(client).toContain("acceptIncomingCallOnce");
    expect(client).toContain("runCallEndGuard");
    expect(client).toContain("runCallMediaModeGuard");
  });

  it("removes tmp route handoff from outgoing navigation", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).not.toContain("ensureOutgoingTempCallBootstrap");
    expect(nav).not.toContain("buildSyntheticTempOutgoingCallSession");
    expect(nav).not.toContain("buildCommunityMessengerInstantOutgoingCallHref");
    expect(nav).not.toContain("outgoingDial");
    expect(nav).toContain("buildCommunityMessengerCallRouteHref(result.session.id)");
  });

  it("keeps local cleanup peer-PATCH-free", () => {
    const active = read("lib/call/active-call-session.ts");
    expect(active).toContain("releaseLocalCallSession");
    expect(active).toContain("peer PATCH 금지");
    const routeExit = read("lib/community-messenger/call-route-exit.ts");
    expect(routeExit).toContain("releaseLocalCallSession");
    expect(routeExit).not.toContain("hardClearActiveCallSession");
  });

  it("blocks Android direct peer lifecycle PATCH", () => {
    for (const path of [
      "android/app/src/main/java/com/dibay/app/call/CallForegroundService.java",
      "android/app/src/main/java/com/dibay/app/call/NativeCallServicePlugin.java",
      "android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java",
    ]) {
      const src = read(path);
      expect(src).not.toMatch(/CallSessionPatchHelper\.patch\([^)]*,\s*sid,\s*"(end|accept|reject|missed)"/);
    }
  });
});
