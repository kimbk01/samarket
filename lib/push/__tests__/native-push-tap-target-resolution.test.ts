import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeNativePushTapData } from "@/lib/push/normalize-native-push-tap-data";
import {
  isAuthRequiredPushRoute,
  resolvePushRouteDecisionFromFcmData,
  resolvePushRouteFromFcmData,
  PUSH_SAFE_FALLBACK_ROUTE,
} from "@/lib/push/resolve-push-route-from-fcm-data";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const CASE_ID = "b17d0642-80fd-4a5e-9c0d-97ccb727876b";
const SUPPORT_ROUTE = `/support/cases/${CASE_ID}`;

describe("A2-3D native notification target resolution", () => {
  it("valid support routeUrl → exact support route", () => {
    expect(
      resolvePushRouteFromFcmData({
        deeplinkResolverKey: "display_route",
        routeUrl: SUPPORT_ROUTE,
        notificationId: "evt-1",
        type: "notification",
      })
    ).toBe(SUPPORT_ROUTE);
  });

  it("generic valid route → preserved", () => {
    expect(
      resolvePushRouteFromFcmData({
        routeUrl: "/community-messenger/rooms/room-1",
      })
    ).toBe("/community-messenger/rooms/room-1");
  });

  it("invalid/external route → safe fallback", () => {
    expect(
      resolvePushRouteFromFcmData({
        routeUrl: "https://evil.example/hack",
      })
    ).toBe(PUSH_SAFE_FALLBACK_ROUTE);
  });

  it("missing route → /notifications fallback", () => {
    const decision = resolvePushRouteDecisionFromFcmData({ type: "notification" });
    expect(decision.path).toBe(PUSH_SAFE_FALLBACK_ROUTE);
    expect(decision.source).toBe("fallback");
  });

  it("supportCaseId wire fallback rebuilds exact case route", () => {
    expect(
      resolvePushRouteFromFcmData({
        supportCaseId: CASE_ID,
        type: "notification",
      })
    ).toBe(SUPPORT_ROUTE);
  });

  it("Cap-like APNs userInfo (aps + routeUrl) normalizes to exact support route", () => {
    const normalized = normalizeNativePushTapData({
      aps: { alert: { title: "Support", body: "Reply" }, badge: 1, sound: "default" },
      routeUrl: SUPPORT_ROUTE,
      url: SUPPORT_ROUTE,
      deeplinkResolverKey: "display_route",
      notificationId: "98c4d1b3-6a28-4283-9c77-6ca5300330ab",
      supportCaseId: CASE_ID,
      targetUserId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
      badgeCount: 1,
    });
    expect(normalized.routeUrl).toBe(SUPPORT_ROUTE);
    expect(normalized.aps).toBeUndefined();
    expect(resolvePushRouteFromFcmData(normalized)).toBe(SUPPORT_ROUTE);
  });

  it("APNS alert body carries routeUrl + supportCaseId (not DB-only)", () => {
    const out: NotificationSideEffectPayloadOut = {
      user_id: "user-1",
      notification_type: "system",
      title: "Support reply",
      body: "Admin replied",
      link_url: SUPPORT_ROUTE,
      link_url_absolute: `https://samarket.vercel.app${SUPPORT_ROUTE}`,
      occurred_at: "2026-09-02T12:00:00.000Z",
      meta: {
        kind: "support_admin_replied",
        category: "inquiry_answered",
        notification_event_id: "evt-support-1",
        notification_id: "evt-support-1",
        deeplink_resolver_key: "display_route",
        display_payload: {
          routeUrl: SUPPORT_ROUTE,
          supportCaseId: CASE_ID,
          publicCaseNo: "SC-100015",
          previewKind: "support_case",
          audience: "MEMBER",
        },
      },
    };
    const fields = buildFcmDataFields(out, { notification_event_id: "evt-support-1" }, {
      title: out.title,
      body: out.body,
      tag: "t1",
    });
    expect(fields.routeUrl).toBe(SUPPORT_ROUTE);
    expect(fields.url).toBe(SUPPORT_ROUTE);
    expect(fields.supportCaseId).toBe(CASE_ID);
    const apns = buildApnsAlertBody({ title: out.title, body: out.body ?? "", data: fields });
    expect(apns.routeUrl).toBe(SUPPORT_ROUTE);
    expect(apns.supportCaseId).toBe(CASE_ID);
    expect(JSON.stringify(apns)).not.toMatch(/token_hash|raw.?token|session.?secret/i);
  });

  it("/support is auth-required so cold-start holds pending until session ready", () => {
    expect(isAuthRequiredPushRoute(SUPPORT_ROUTE)).toBe(true);
    expect(isAuthRequiredPushRoute("/support/enter")).toBe(true);
  });

  it("PushRouteListener: recovering phases do not drop tap before resolve", () => {
    const source = readFileSync(join(process.cwd(), "components/push/PushRouteListener.tsx"), "utf8");
    expect(source).toContain("normalizeNativePushTapData");
    expect(source).toContain("isRecoveringPhase(phase)");
    expect(source).toContain("resolvePushRouteFromFcmData(data)");
    // Resolve before settled-phase presentation gate.
    const resolveIdx = source.indexOf("const path = resolvePushRouteFromFcmData(data)");
    const gateIdx = source.indexOf("if (!isRecoveringPhase(phase))");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(resolveIdx);
  });
});
