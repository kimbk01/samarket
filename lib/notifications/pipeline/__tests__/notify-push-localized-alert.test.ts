/**
 * 2026-11-27 언어 사후 검토 C3 — 알림 푸시도 meta 키가 있으면 기기 언어로 다시 그린다
 * (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §3 C3).
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { notificationCopyMeta } from "@/lib/notifications/notification-stored-copy";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildNotificationLocalizedPushAlert } from "@/lib/notifications/pipeline/notify-push-dispatcher";

function row(legacyMeta: Record<string, unknown> | null, title = "저장 제목", body = "저장 본문"): NotificationEventRow {
  return {
    id: "ev-1",
    user_id: "u1",
    type: "community_activity",
    title,
    body,
    display_payload: legacyMeta ? { legacyMeta } : {},
  } as unknown as NotificationEventRow;
}

describe("buildNotificationLocalizedPushAlert", () => {
  it("titleKey·messageKey → ko·en 두 벌", () => {
    const meta = notificationCopyMeta({
      titleKey: "notify_friend_request_received_title",
      messageKey: "notify_friend_request_received_body",
      varKeys: { name: "notify_member_fallback_name" },
    });
    const alert = buildNotificationLocalizedPushAlert(row(meta))!;
    const name = (lang: "ko" | "en") => translate(lang, "notify_member_fallback_name");
    expect(alert.ko!.title).toBe(translate("ko", "notify_friend_request_received_title", { name: name("ko") }));
    expect(alert.en!.title).toBe(translate("en", "notify_friend_request_received_title", { name: name("en") }));
    expect(alert.en!.body).toBe(translate("en", "notify_friend_request_received_body", { name: name("en") }));
  });

  it("키가 한쪽만 있으면 다른 쪽은 저장 글자", () => {
    const alert = buildNotificationLocalizedPushAlert(row({ titleKey: "notify_friend_request_received_title", vars: { name: "Kim" } }))!;
    expect(alert.en!.title).toBe(translate("en", "notify_friend_request_received_title", { name: "Kim" }));
    expect(alert.en!.body).toBe("저장 본문");
  });

  it("meta 키 없음·모르는 키 → null (지금과 같은 발송)", () => {
    expect(buildNotificationLocalizedPushAlert(row(null))).toBeNull();
    expect(buildNotificationLocalizedPushAlert(row({ kind: "x" }))).toBeNull();
    expect(buildNotificationLocalizedPushAlert(row({ messageKey: "not_a_key_x" }))).toBeNull();
  });
});
