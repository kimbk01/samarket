import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("CallClient accept join guard contract", () => {
  const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");

  it("separates nativePrep and nativeAcceptCompleted routes", () => {
    expect(client).toContain("isNativeCalleePrepOnlyRoute");
    expect(client).toContain("isNativeCalleeAcceptCompletedRoute");
    expect(client).toContain("isNativeCalleeAcceptOwnedRoute");
    expect(client).not.toContain("const nativeAcceptRoute =");
  });

  it("logs prep/completed enter and defers join until server active", () => {
    expect(client).toContain("accept_route_prep_enter");
    expect(client).toContain("accept_route_completed_enter");
    expect(client).toContain("join_deferred_until_server_active");
    expect(client).toContain("server_active_confirmed_join_start");
    expect(client).toContain("canStartCalleeJoin");
    expect(client).toContain("waitForActiveCallSessionAfterNativeAccept");
  });

  it("does not treat seed active as completed accept or immediate join", () => {
    expect(client).not.toContain("accept_route_active_seed");
    expect(client).toContain("markNativeCalleeAcceptPending");
    expect(client).not.toMatch(
      /handleNativePrepEnter[\s\S]{0,500}applyIncomingCallConsumedSideEffects\([^)]*,\s*"accepted"/
    );
    expect(client).toContain("acceptConfirm: true");
    expect(client).toContain("scheduleAcceptConfirmRefresh");
    expect(client).toContain("shouldAutoEndAfterJoinFailure");
    expect(client).toContain("join_failed_stay_active");
  });

  it("re-enters nativeAccept completed route after prep URL transition", () => {
    expect(client).toContain("nativeAcceptCompletedHydrateRef");
    expect(client).toContain("prevNativeAcceptCompletedRouteRef");
    expect(client).toContain("finalizeNativeAcceptCompletedSession");
  });
});
