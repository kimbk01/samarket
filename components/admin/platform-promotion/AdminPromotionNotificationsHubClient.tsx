"use client";

import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Promotion → Notifications hub.
 * SAVE ≠ SEND. Push uses existing notification campaign authority.
 * Bell remains Event Distribution configuration (not a second send engine).
 */
export function AdminPromotionNotificationsHubClient() {
  const { safeT } = useI18n();

  return (
    <div className="space-y-4 p-4" data-admin-promotion-notifications-hub="1">
      <div>
        <h1 className="text-lg font-semibold">
          {safeT("admin_menu_promotion_notifications", {
            fallbackKo: "알림",
            fallbackEn: "Notifications",
          })}
        </h1>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("admin_promotion_notifications_desc", {
            fallbackKo:
              "Push 발송과 앱 알림(Bell)을 구분합니다. 저장·게시는 발송이 아닙니다.",
            fallbackEn:
              "Separate Push send from in-app Bell. Save/Publish is not Send.",
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="push"
        >
          <div className="font-semibold">
            {safeT("admin_promotion_channel_push", {
              fallbackKo: "Push",
              fallbackEn: "Push",
            })}
          </div>
          <p className="mt-1 text-xs text-sam-muted">
            {safeT("admin_promotion_channel_push_desc", {
              fallbackKo: "초안 저장 ≠ Push 보내기. 기존 알림 캠페인 엔진을 사용합니다.",
              fallbackEn: "Saving a draft ≠ Send push. Uses the existing notification campaign engine.",
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionLink href="/admin/notifications" variant="primary">
              {safeT("admin_promotion_open_push_campaigns", {
                fallbackKo: "Push 캠페인 열기",
                fallbackEn: "Open push campaigns",
              })}
            </AdminActionLink>
            <AdminActionLink href="/admin/notifications/create" variant="secondary">
              {safeT("admin_promotion_create_push_draft", {
                fallbackKo: "Push 초안 만들기",
                fallbackEn: "Create push draft",
              })}
            </AdminActionLink>
          </div>
        </div>

        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="bell"
        >
          <div className="font-semibold">
            {safeT("admin_promotion_channel_bell", {
              fallbackKo: "앱 알림 (Bell)",
              fallbackEn: "In-app Bell",
            })}
          </div>
          <p className="mt-1 text-xs text-sam-muted">
            {safeT("admin_promotion_channel_bell_desc", {
              fallbackKo:
                "Event 노출 설정(Distribution)에서 구성합니다. 별도 발송 버튼이 아닙니다.",
              fallbackEn:
                "Configured on Event exposure (Distribution). Not a separate send button.",
            })}
          </p>
          <div className="mt-3">
            <AdminActionLink href="/admin/platform-events" variant="secondary">
              {safeT("admin_promotion_banner_goto_events", {
                fallbackKo: "이벤트에서 노출 설정",
                fallbackEn: "Configure via Events",
              })}
            </AdminActionLink>
          </div>
        </div>
      </div>
    </div>
  );
}
