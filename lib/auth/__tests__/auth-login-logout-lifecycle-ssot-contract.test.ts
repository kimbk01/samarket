import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canPresentAuthenticatedNotification } from "@/lib/push/native/can-present-authenticated-notification";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("auth login/logout lifecycle SSOT contract (L1–L12)", () => {
  it("L1 login: bind before eligibility true", () => {
    const immediate = read("lib/auth/auth-session-immediate.client.ts");
    const register = read("lib/push/native/register-native-push-client.ts");
    const session = read("lib/auth/dibay-session-manager.ts");

    const bindIdx = immediate.indexOf("bindAuthUserId(profile.id)");
    const markIdx = immediate.indexOf('markSessionAuthenticatedFromClient("prime_supabase")');
    expect(bindIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(-1);
    expect(bindIdx).toBeLessThan(markIdx);

    expect(register).toContain("setNativeMemberCallEligible(true");
    expect(register).toContain("id.userId");
    expect(session).toContain("applyAuthenticatedPhase(source, boundUserId)");
    expect(session).toContain("getBoundAuthUserId()");
  });

  it("L2 restore: authenticated projection on session user id; no hard logout on token race", () => {
    const session = read("lib/auth/dibay-session-manager.ts");
    const policy = read("lib/auth/dibay-session-policy.ts");
    expect(session).toContain("confirmAuthenticatedWithRegistry(source, sessionData.session.user.id)");
    expect(session).toContain("applyAuthenticatedPhase(`auth_event:${event}`, session.user.id)");
    expect(policy).toContain("recovering: boot/cold start/cookie race/network delay; never wipe/deactivate");
    expect(policy).toContain("terminal refresh-token invalidation only");
  });

  it("L3 logout local fail-closed before deactivate", () => {
    const flow = read("lib/auth/explicit-logout-flow.ts");
    const fnStart = flow.indexOf("export async function runExplicitLogoutFlow");
    const body = flow.slice(fnStart);
    expect(body.indexOf("applyLocalLogoutFailClosed")).toBeGreaterThan(-1);
    expect(body.indexOf("applyLocalLogoutFailClosed")).toBeLessThan(
      body.indexOf("disconnectNativeDevicesForLogout"),
    );
  });

  it("L4 deactivate failure still terminal guest; no eligible true in logout flow", () => {
    const flow = read("lib/auth/explicit-logout-flow.ts");
    expect(flow).toContain("markSessionTerminalGuestFromClient");
    expect(flow).toContain("deviceUnbindOk");
    expect(flow).not.toMatch(/setNativeMemberCallEligible\(\s*true/);
    expect(flow).not.toMatch(/eligible:\s*true/);
  });

  it("L5–L7 A→B: register/session project B; canPresent mismatch DROP; match PRESENT", () => {
    const register = read("lib/push/native/register-native-push-client.ts");
    const session = read("lib/auth/dibay-session-manager.ts");
    expect(register).toContain("id.userId || null");
    expect(session).toContain("boundUserId: eligible ? boundUserId : null");

    expect(
      canPresentAuthenticatedNotification({
        memberEventEligible: true,
        boundUserId: "user-b",
        payloadRecipientUserId: "user-a",
      }),
    ).toEqual({ ok: false, reason: "recipient_user_mismatch" });

    expect(
      canPresentAuthenticatedNotification({
        memberEventEligible: true,
        boundUserId: "user-b",
        payloadRecipientUserId: "user-b",
      }),
    ).toEqual({ ok: true, reason: "present" });
  });

  it("L8–L9 current device vs all: logout-client scopes + deactivate deviceId vs null", () => {
    const client = read("lib/auth/logout-client.ts");
    const logout = read("app/api/auth/logout/route.ts");
    const logoutAll = read("app/api/auth/logout-all/route.ts");
    expect(client).toContain('runExplicitLogoutFlow("current_device")');
    expect(client).toContain('runExplicitLogoutFlow("all_devices")');
    expect(logout).toContain("deactivateAllUserDevicesForLogout(sb, auth.userId, deviceId || null)");
    expect(logoutAll).toContain("deactivateAllUserDevicesForLogout(sb, auth.userId, null)");
  });

  it("L10 refresh: unexpected SIGNED_OUT recovers; not wipe on expiry race", () => {
    const session = read("lib/auth/dibay-session-manager.ts");
    const policy = read("lib/auth/dibay-session-policy.ts");
    expect(session).toContain("beginUnexpectedSignedOutRecovery");
    expect(session).toContain('ensureSessionHealthy("auth_event:SIGNED_OUT:unexpected")');
    expect(session).toContain("establishRecoverableGuestAuthState");
    expect(policy).toContain("never wipe/deactivate");
  });

  it("L11 auth-exit-coordinator navigate after logout only once", () => {
    const exit = read("lib/auth/auth-exit-coordinator.ts");
    expect(exit).toContain("navigateAfterAuthExitOnce");
    expect(exit).toContain("isAuthExitNavigateStarted");
    expect(exit).toContain("runAuthLogoutExit");
    const logoutExit = exit.slice(exit.indexOf("export async function runAuthLogoutExit"));
    expect(logoutExit.indexOf("navigateAfterAuthExitOnce(\"logout\")")).toBeGreaterThan(-1);
  });

  it("L12 LogoutContent no 6_000 parallel navigate", () => {
    const logout = read("components/my/settings/LogoutContent.tsx");
    expect(logout).not.toContain("6_000");
    expect(logout).not.toContain("safetyForceNavigate");
    expect(logout).toContain("runAuthLogoutExit");
  });
});
