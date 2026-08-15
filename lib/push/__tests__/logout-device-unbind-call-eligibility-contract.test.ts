import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("logout device unbind + native call eligibility contract", () => {
  it("deactivate allows session-missing cleanup only with device_id + push_token proof", () => {
    const deactivate = read("app/api/me/devices/deactivate/route.ts");
    expect(deactivate).toContain("getOptionalAuthenticatedUserId");
    expect(deactivate).toContain("deactivateBoundDeviceByTokenProof");
    expect(deactivate).toContain("device_unbind_proof_required");
    expect(deactivate).toContain("scope_requires_auth");
    expect(deactivate).not.toMatch(/requireAuthenticatedUserId\(\)/);
  });

  it("auth logout still cleans trusted bound device when already_logged_out", () => {
    const logout = read("app/api/auth/logout/route.ts");
    expect(logout).toContain("already_logged_out");
    expect(logout).toContain("cleanupTrustedDeviceBindingFromLogoutBody");
    expect(logout).toContain("deactivateBoundDeviceByTokenProof");
    expect(logout).toContain("push_token");
  });

  it("client logout disconnect sends token proof and clears native eligibility", () => {
    const client = read("lib/push/disconnect-native-devices-for-logout-client.ts");
    expect(client).toContain("readDeviceUnbindPushToken");
    expect(client).toContain("push_token");
    expect(client).toContain("setNativeMemberCallEligible");
    expect(client).toContain("deactivateBoundPushDeviceViaNative");
    expect(client).not.toMatch(/\.catch\(\(\)\s*=>\s*undefined\)/);
  });

  it("Android FCM receive and Activity gate guest incoming call UI", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    const video = read(
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java",
    );
    const voice = read(
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java",
    );
    const store = read(
      "android/app/src/main/java/com/dibay/app/DibayCallAuthEligibilityStore.java",
    );
    expect(delivery).toContain("incoming_blocked_guest_ineligible");
    expect(delivery).toContain("DibayCallAuthEligibilityStore.isMemberCallEligible");
    expect(video).toContain("incoming_activity_blocked_guest_ineligible");
    expect(voice).toContain("incoming_activity_blocked_guest_ineligible");
    expect(store).toContain("member_call_eligible");
    expect(store).toContain("getBoolean(KEY_ELIGIBLE, false)");
  });

  it("call push sender still requires user_devices.is_active=true", () => {
    const loader = read("lib/push/dispatch/load-active-push-targets.ts");
    expect(loader).toContain('.eq("is_active", true)');
  });

  it("login/register rebinds native eligibility and unbind token cache", () => {
    const register = read("lib/push/native/register-native-push-client.ts");
    const session = read("lib/auth/dibay-session-manager.ts");
    expect(register).toContain("cacheDeviceUnbindPushToken");
    expect(register).toContain("setNativeMemberCallEligible(true");
    expect(session).toContain("projectMemberEventEligibility(true");
    expect(session).toContain("projectMemberEventEligibility(false");
    expect(session).toContain("applyAuthenticatedPhase");
    expect(session).toContain("applyTerminalGuestPhase");
  });
});
