import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canPresentAuthenticatedNotification,
  resolvePushPayloadRecipientUserId,
} from "@/lib/push/native/can-present-authenticated-notification";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("logout previous-account event fail-closed", () => {
  describe("pure presentation gate (T1–T7)", () => {
    it("T1 authenticated + matching user push → PRESENT", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: true,
          boundUserId: "user-a",
          payloadRecipientUserId: "user-a",
        }),
      ).toEqual({ ok: true, reason: "present" });
    });

    it("T2 guest + previous-user chat push → DROP", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: false,
          boundUserId: null,
          payloadRecipientUserId: "user-a",
        }).ok,
      ).toBe(false);
    });

    it("T3 logout-in-progress (eligible false) + previous-user push → DROP", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: false,
          boundUserId: "user-a",
          payloadRecipientUserId: "user-a",
        }).reason,
      ).toBe("member_event_ineligible");
    });

    it("T4 logged-out + previous-user generic push → DROP", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: false,
          boundUserId: "",
          payloadRecipientUserId: "user-a",
        }).ok,
      ).toBe(false);
    });

    it("T5 bound user B + payload target A → DROP", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: true,
          boundUserId: "user-b",
          payloadRecipientUserId: "user-a",
        }),
      ).toEqual({ ok: false, reason: "recipient_user_mismatch" });
    });

    it("T6 bound user B + payload target B → PRESENT", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: true,
          boundUserId: "user-b",
          payloadRecipientUserId: "user-b",
        }).ok,
      ).toBe(true);
    });

    it("T7 logged-out incoming call → BLOCK (eligible false)", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: false,
          boundUserId: null,
          payloadRecipientUserId: "user-a",
        }).ok,
      ).toBe(false);
    });

    it("resolves recipient from wire keys including targetUserId", () => {
      expect(
        resolvePushPayloadRecipientUserId({
          targetUserId: "u-target",
          recipientMemberId: "u-member",
        }),
      ).toBe("u-member");
      expect(resolvePushPayloadRecipientUserId({ userId: "u1" })).toBe("u1");
      expect(resolvePushPayloadRecipientUserId({})).toBeNull();
    });

    it("eligible without bound user → DROP", () => {
      expect(
        canPresentAuthenticatedNotification({
          memberEventEligible: true,
          boundUserId: null,
          payloadRecipientUserId: null,
        }).reason,
      ).toBe("bound_user_missing");
    });
  });

  describe("wiring contracts (T8–T10 + local fail-closed)", () => {
    it("T8/T9 logout flow applies local fail-closed first; deactivate observed separately", () => {
      const flow = read("lib/auth/explicit-logout-flow.ts");
      const failClosed = read("lib/auth/apply-local-logout-fail-closed.ts");
      const client = read("lib/auth/logout-client.ts");
      expect(failClosed).toContain("projectNativeMemberEventEligibility");
      expect(failClosed).toContain("eligible: false");
      const fnStart = flow.indexOf("export async function runExplicitLogoutFlow");
      expect(fnStart).toBeGreaterThan(-1);
      const body = flow.slice(fnStart);
      expect(body.indexOf("applyLocalLogoutFailClosed")).toBeGreaterThan(-1);
      expect(body.indexOf("applyLocalLogoutFailClosed")).toBeLessThan(
        body.indexOf("disconnectNativeDevicesForLogout"),
      );
      expect(flow).toContain("deviceUnbindOk");
      expect(flow).toContain("deviceUnbindError");
      expect(client).toContain("deviceUnbindOk");
      expect(client).toContain("deviceUnbindError");
    });

    it("T9 deactivate failure must not re-enable eligibility", () => {
      const flow = read("lib/auth/explicit-logout-flow.ts");
      // After deactivate failure, terminal guest still projects ineligible.
      expect(flow).toContain("markSessionTerminalGuestFromClient");
      expect(flow).not.toMatch(/setNativeMemberCallEligible\(\s*true/);
      expect(flow).not.toMatch(/eligible:\s*true/);
    });

    it("T10 A→B: register/session project bound B; FCM payload carries targetUserId", () => {
      const register = read("lib/push/native/register-native-push-client.ts");
      const fcm = read("lib/push/dispatch/fcm-data-payload-contract.ts");
      const loader = read("lib/push/dispatch/load-active-push-targets.ts");
      const deactivate = read("lib/push/dispatch/deactivate-failed-token.ts");
      expect(register).toContain("setNativeMemberCallEligible(true");
      expect(register).toContain("id.userId");
      expect(fcm).toContain("targetUserId");
      expect(loader).toContain('.eq("is_active", true)');
      expect(deactivate).toContain("is_active: false");
    });

    it("Android FCM gates all tray paths; call delivery uses presentDecision", () => {
      const fcmSvc = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
      const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
      const store = read("android/app/src/main/java/com/dibay/app/DibayCallAuthEligibilityStore.java");
      expect(fcmSvc).toContain("allowAuthenticatedPresentation");
      expect(fcmSvc).toContain("authenticated_notification_dropped");
      expect(delivery).toContain("presentDecision");
      expect(store).toContain("canPresentAuthenticatedNotification");
      expect(store).toContain("bound_member_user_id");
      expect(store).toContain("getBoolean(KEY_ELIGIBLE, false)");
    });

    it("iOS VoIP suppresses sustained ring when ineligible; payload identity gated", () => {
      const voip = read("ios/App/App/Push/VoIPPushRegistry.swift");
      const store = read("ios/App/App/Call/DibayMemberEventEligibilityStore.swift");
      expect(voip).toContain("incoming_blocked_guest_ineligible");
      expect(voip).toContain("incoming_blocked_auth_gate");
      expect(voip).toContain("ringtonePolicy: \"silent\"");
      expect(store).toContain("canPresentAuthenticatedNotification");
      expect(store).toContain("boundMemberUserId");
    });

    it("6s parallel navigation race removed from LogoutActionTrigger", () => {
      const logout = read("components/my/settings/LogoutContent.tsx");
      expect(logout).not.toContain("6_000");
      expect(logout).not.toContain("safetyForceNavigate");
      expect(logout).toContain("runAuthLogoutExit");
    });

    it("push tap drops when presentation gate fails", () => {
      const listener = read("components/push/PushRouteListener.tsx");
      expect(listener).toContain("canPresentAuthenticatedNotification");
      expect(listener).toContain("notification_tap_dropped");
    });
  });
});
