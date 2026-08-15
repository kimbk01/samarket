import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("cross-platform auth lifecycle SSOT contract", () => {
  it("SIGNED_OUT requires explicit logout intent for terminal_guest", () => {
    const manager = read("lib/auth/dibay-session-manager.ts");
    expect(manager).toContain("isExplicitLogoutIntentActive");
    expect(manager).toContain("SIGNED_OUT:unexpected");
    expect(manager).toContain("SIGNED_OUT:explicit");
    expect(manager).not.toMatch(
      /if \(event === "SIGNED_OUT"\) \{\s*establishGuestAuthState\(`auth_event:\$\{event\}`\)/,
    );
  });

  it("explicit logout begins intent before signOut", () => {
    const flow = read("lib/auth/explicit-logout-flow.ts");
    const logout = read("lib/auth/logout-client.ts");
    expect(flow).toContain("beginExplicitLogoutIntent");
    expect(logout).toContain("beginExplicitLogoutIntent");
  });

  it("SupabaseAuthSync does not wipe on unexpected SIGNED_OUT", () => {
    const sync = read("components/auth/SupabaseAuthSync.tsx");
    expect(sync).toContain("isExplicitLogoutIntentActive");
    expect(sync).toContain("signed_out_unexpected_no_wipe");
  });

  it("AuthSessionBoundary holds login exit while recovering", () => {
    const boundary = read("components/auth/AuthSessionBoundary.tsx");
    expect(boundary).toContain("isRecoveringPhase");
    expect(boundary).toContain('phase === "authenticated"');
  });

  it("401 recovery does not establish terminal guest", () => {
    const guest = read("lib/auth/guest-auth-state.ts");
    const recovery = read("lib/auth/api-auth-recovery.ts");
    expect(guest).toContain("establishRecoverableGuestAuthState(`401:${source}`)");
    expect(recovery).toContain("handleApi401");
  });

  it("Android call eligibility is projection; iOS has equivalent gate", () => {
    const android = read(
      "android/app/src/main/java/com/dibay/app/DibayCallAuthEligibilityStore.java",
    );
    const iosStore = read("ios/App/App/Call/DibayMemberEventEligibilityStore.swift");
    const voip = read("ios/App/App/Push/VoIPPushRegistry.swift");
    expect(android).toContain("AUTH SESSION PROJECTION");
    expect(iosStore).toContain("NOT global auth SSOT");
    expect(voip).toContain("incoming_blocked_guest_ineligible");
    expect(voip).toContain("markTerminalSuppressed");
  });

  it("PushRouteListener holds auth-required routes while recovering", () => {
    const push = read("components/push/PushRouteListener.tsx");
    expect(push).toContain('return "hold"');
    expect(push).toContain("terminal_guest");
    expect(push).not.toMatch(/establishGuestAuthState|markSessionTerminalGuestFromClient|signOut\(/);
  });
});
