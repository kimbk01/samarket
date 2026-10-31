/**
 * 재감사 2026-11-01 B — 원본 화면이 없는 관리자 알림(채팅 신고 결과·제재·운영 공지)은
 * 종 행·푸시·종 팝업/알림센터 탭 모두 알림 상세로 연다(목록으로 되돌리지 않음).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://app.example" }));

import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildPushPayload } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import { activateNotificationDestination } from "@/lib/notifications/navigate-notification-destination";
import { isAdminNoticeContentOnlyEvent } from "@/lib/notifications/admin-notice-content-only";
import { finalizeNotificationEventRoute } from "@/lib/notifications/core/notification-event-final-route";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";

function row(overrides: Partial<NotificationEventRow>): NotificationEventRow {
  return {
    id: "ev-report-1",
    user_id: "u-1",
    type: "admin_notice",
    category: "admin_notice" as NotificationEventRow["category"],
    room_id: null,
    call_session_id: null,
    actor_user_id: null,
    message_id: null,
    title: "신고 처리 결과",
    body: "신고하신 내용을 확인했어요",
    display_payload: {
      routeUrl: null,
      legacyPushKind: "notice",
      legacyMeta: { kind: "chat_report_result", report_id: "r1", action: "rejected" },
    },
    unread: true,
    read_at: null,
    delivered_at: null,
    opened_at: null,
    muted_snapshot: false,
    push_suppressed_reason: null,
    sound_suppressed_reason: null,
    dedupe_key: "chat_report_result:x:r1:reporter",
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as NotificationEventRow;
}

describe("content-only admin notice → detail", () => {
  it("predicate: no route / bare / fallback → true; original route or room → false", () => {
    expect(isAdminNoticeContentOnlyEvent({ type: "admin_notice", routeUrl: null })).toBe(true);
    expect(isAdminNoticeContentOnlyEvent({ type: "admin_notice", routeUrl: "/notifications" })).toBe(true);
    expect(
      isAdminNoticeContentOnlyEvent({ type: "admin_notice", routeUrl: "/notifications?fallback=origin_unavailable" })
    ).toBe(true);
    expect(isAdminNoticeContentOnlyEvent({ type: "admin_notice", routeUrl: "/stores/owner?storeId=s" })).toBe(false);
    expect(isAdminNoticeContentOnlyEvent({ type: "admin_notice", roomId: "room-1" })).toBe(false);
    expect(isAdminNoticeContentOnlyEvent({ type: "chat_message", routeUrl: null })).toBe(false);
  });

  it("push link for chat report result = stored final route /notifications/{id} (C2: 저장 시 확정)", () => {
    const fin = finalizeNotificationEventRoute({
      id: "ev-report-1",
      userId: "u-1",
      dedupeKey: "k",
      type: "admin_notice",
      category: "admin_notice" as NotificationEventRow["category"],
      title: "신고 처리 결과",
      body: "b",
      displayPayload: row({}).display_payload as Record<string, unknown>,
    });
    expect(fin.displayPayload.routeUrl).toBe("/notifications/ev-report-1");
    const out = buildPushPayload(row({ display_payload: fin.displayPayload }), 0);
    expect(out.link_url).toBe("/notifications/ev-report-1");
    const fields = buildFcmDataFields(out, undefined, { tag: "t" }) as Record<string, string | undefined>;
    expect(fields.url).toBe("/notifications/ev-report-1");
    expect(resolvePushRouteFromFcmData(fields)).toBe("/notifications/ev-report-1");
  });

  it("admin notice with an original route keeps it in the push", () => {
    const out = buildPushPayload(row({ display_payload: { routeUrl: "/stores/owner?storeId=s1" } }), 0);
    expect(out.link_url).toBe("/stores/owner?storeId=s1");
  });

  it("row tap whose origin cannot be resolved opens the notification detail, not the list", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    activateNotificationDestination({
      router,
      resolveInput: {
        inboxRow: {
          id: "n-orphan",
          notification_type: "community",
          link_url: "/notifications?fallback=origin_unavailable",
          meta: null,
        },
        fallbackHref: "/notifications?fallback=origin_unavailable",
      },
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(String(router.push.mock.calls[0]![0])).toMatch(/^\/notifications\/n-orphan/);
  });
});

describe("N5 group invite push type", () => {
  it("community_group_invite → FCM type group_message (not 1:1 chat_message)", () => {
    const out = buildPushPayload(
      row({
        id: "ev-invite-1",
        type: "group_message",
        category: "group_message" as NotificationEventRow["category"],
        room_id: "room-g1",
        display_payload: {
          routeUrl: "/community-messenger/rooms/room-g1",
          legacyMeta: { kind: "community_group_invite", room_id: "room-g1" },
        },
      }),
      0
    );
    const fields = buildFcmDataFields(out, undefined, { tag: "t" }) as Record<string, string | undefined>;
    expect(fields.type).toBe("group_message");
    expect(resolvePushRouteFromFcmData(fields)).toContain("/community-messenger/rooms/room-g1");
  });
});
