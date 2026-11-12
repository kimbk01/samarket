import { describe, expect, it } from "vitest";
import {
  buildExactMissedCallRoomHref,
  buildRoomBoundMissedCallNotificationInput,
  decideRoomBoundMissedCallNotification,
  isCallerCancelledBeforeAnswer,
  isRoomBoundMissedCallCandidate,
  resolveMissedCallNotificationDedupeKey,
  resolveMissedNotificationRoomId,
} from "@/lib/community-messenger/call-authority/call-missed-notification-authority";
import { buildMissedCallWebPath } from "@/lib/notifications/policy/notification-deeplink-paths";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";

describe("call-missed-notification-authority CUT5", () => {
  it("N1/N3/N4: missed_timeout → callee notify with callKind", () => {
    const voice = decideRoomBoundMissedCallNotification({
      status: "missed",
      endedReason: "missed",
      roomId: "room-1",
      callSessionId: "sess-1",
      initiatorUserId: "caller",
      recipientUserId: "callee",
      callKind: "voice",
    });
    expect(voice).toEqual({
      notify: true,
      recipientUserId: "callee",
      roomId: "room-1",
      callSessionId: "sess-1",
      actorUserId: "caller",
      callKind: "voice",
    });
    const video = decideRoomBoundMissedCallNotification({
      status: "missed",
      roomId: "room-1",
      callSessionId: "sess-2",
      initiatorUserId: "caller",
      recipientUserId: "callee",
      callKind: "video",
    });
    expect(video).toMatchObject({ notify: true, callKind: "video" });
  });

  it("N2: caller is never the notification recipient", () => {
    const d = decideRoomBoundMissedCallNotification({
      status: "missed",
      roomId: "r",
      callSessionId: "s",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    expect(d.notify && d.recipientUserId).toBe("callee");
    expect(d.notify && d.recipientUserId).not.toBe("caller");
  });

  it("N5: idempotency key is session+callee", () => {
    expect(resolveMissedCallNotificationDedupeKey("sess-1", "callee")).toBe("missed_call:sess-1:callee");
    const a = buildRoomBoundMissedCallNotificationInput({
      recipientUserId: "callee",
      roomId: "room-1",
      callSessionId: "sess-1",
      actorUserId: "caller",
      callKind: "voice",
    });
    const b = buildRoomBoundMissedCallNotificationInput({
      recipientUserId: "callee",
      roomId: "room-1",
      callSessionId: "sess-1",
      actorUserId: "caller",
      callKind: "voice",
    });
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });

  it("N6/N7: room binding ignores client-supplied roomId", () => {
    expect(
      resolveMissedNotificationRoomId({
        sessionRoomId: "canonical-room",
        clientSuppliedRoomId: "evil-room",
      }),
    ).toBe("canonical-room");
    const input = buildRoomBoundMissedCallNotificationInput({
      recipientUserId: "callee",
      roomId: "canonical-room",
      callSessionId: "sess-1",
      actorUserId: "caller",
      callKind: "voice",
    });
    expect(input.roomId).toBe("canonical-room");
    expect(String(input.displayPayload?.routeUrl)).toBe("/community-messenger/rooms/canonical-room");
  });

  it("N8/N9: exact room href — no /calls/{sessionId}", () => {
    const href = buildExactMissedCallRoomHref({ roomId: "room-9" });
    expect(href).toBe("/community-messenger/rooms/room-9");
    expect(href).not.toContain("/calls/");
    expect(href).not.toContain("call-history");
    expect(buildMissedCallWebPath("room-9", "sess-9")).toBe("/community-messenger/rooms/room-9");
    expect(
      resolveNotificationDestination({
        resolverKey: "missed_call",
        roomId: "room-9",
        callSessionId: "sess-9",
      }).href,
    ).toBe("/community-messenger/rooms/room-9");
  });

  it("N8 FCM legacy resolver uses exact room", () => {
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        callId: "sess-9",
        roomId: "room-9",
      }),
    ).toBe("/community-messenger/rooms/room-9");
    expect(
      resolvePushRouteFromFcmData({
        type: "missed_call",
        callId: "sess-9",
      }),
    ).toBe("/community-messenger");
  });

  it("skips cancel/reject/policy/busy", () => {
    for (const endedReason of [
      "canceled",
      "declined",
      "incoming_policy_superseded",
      "peer_busy",
      "answered_elsewhere",
    ]) {
      expect(
        decideRoomBoundMissedCallNotification({
          status: "missed",
          endedReason,
          roomId: "r",
          callSessionId: "s",
          initiatorUserId: "a",
          recipientUserId: "b",
        }).notify,
      ).toBe(false);
    }
  });

  it("skips non-missed status and missing room", () => {
    expect(
      decideRoomBoundMissedCallNotification({
        status: "cancelled",
        roomId: "r",
        callSessionId: "s",
        initiatorUserId: "a",
        recipientUserId: "b",
      }).notify,
    ).toBe(false);
    expect(
      decideRoomBoundMissedCallNotification({
        status: "missed",
        roomId: "",
        callSessionId: "s",
        initiatorUserId: "a",
        recipientUserId: "b",
      }).notify,
    ).toBe(false);
  });

  // Owner 2026-11-13 「발신 후 수신 전 취소 → 수신자 부재중」 — docs/audit/call-cancel-callee-missed-design-2026-11-13.md D3
  it("caller cancel before answer → callee missed notification (once per session)", () => {
    for (const endedReason of ["canceled", "cancelled"]) {
      const d = decideRoomBoundMissedCallNotification({
        status: "cancelled",
        endedReason,
        roomId: "r",
        callSessionId: "s",
        initiatorUserId: "a",
        recipientUserId: "b",
        callKind: "video",
      });
      expect(d.notify).toBe(true);
      if (d.notify) {
        expect(d.recipientUserId).toBe("b");
        expect(d.actorUserId).toBe("a");
        expect(d.callKind).toBe("video");
      }
    }
    expect(resolveMissedCallNotificationDedupeKey("s", "b")).toBe(resolveMissedCallNotificationDedupeKey("s", "b"));
  });

  it("cancelled by busy / redial / policy / group → no missed notification", () => {
    for (const endedReason of ["peer_busy", "caller_busy", "callee_busy", "redial_replaced", "incoming_policy_superseded", "answered_elsewhere", ""]) {
      expect(
        decideRoomBoundMissedCallNotification({
          status: "cancelled",
          endedReason,
          roomId: "r",
          callSessionId: "s",
          initiatorUserId: "a",
          recipientUserId: "b",
        }).notify,
        endedReason,
      ).toBe(false);
    }
    expect(
      decideRoomBoundMissedCallNotification({
        status: "cancelled",
        endedReason: "canceled",
        sessionMode: "group",
        roomId: "r",
        callSessionId: "s",
        initiatorUserId: "a",
        recipientUserId: "b",
      }).notify,
    ).toBe(false);
    expect(
      decideRoomBoundMissedCallNotification({
        status: "rejected",
        endedReason: "declined",
        roomId: "r",
        callSessionId: "s",
        initiatorUserId: "a",
        recipientUserId: "b",
      }).notify,
    ).toBe(false);
  });

  it("candidate gate (service call site) = missed/timeout + caller cancel only", () => {
    expect(isRoomBoundMissedCallCandidate({ status: "missed" })).toBe(true);
    expect(isRoomBoundMissedCallCandidate({ status: "timeout" })).toBe(true);
    expect(isRoomBoundMissedCallCandidate({ status: "cancelled", endedReason: "canceled" })).toBe(true);
    expect(isRoomBoundMissedCallCandidate({ status: "cancelled", endedReason: "peer_busy" })).toBe(false);
    expect(isRoomBoundMissedCallCandidate({ status: "ended", endedReason: "canceled" })).toBe(false);
    expect(isCallerCancelledBeforeAnswer({ status: "CANCELLED", endedReason: "Canceled" })).toBe(true);
  });
});
