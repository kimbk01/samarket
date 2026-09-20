"use client";

import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NOTIFICATIONS_SEND_HREF } from "@/lib/admin/promotion-ownership-visibility";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";

/**
 * Promotion → Notifications hub.
 * Summarize + deep-link only. SAVE ≠ SEND. No duplicate send engine.
 */
export function AdminPromotionNotificationsHubClient() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";

  return (
    <div className="space-y-4 p-4" data-admin-promotion-notifications-hub="1">
      <div>
        <h1 className="text-lg font-semibold">
          {safeT("admin_menu_promotion_notifications", {
            fallbackKo: "알림",
            fallbackEn: "Notifications",
          })}
        </h1>
        <p
          className="mt-1 max-w-2xl text-sm text-sam-muted"
          data-admin-promotion-notifications-purpose="1"
        >
          {safeT("admin_promotion_notifications_desc", {
            fallbackKo:
              "Push 알림과 앱 알림함 전달을 구분합니다. 이 화면은 안내·연결만 하며, 실제 발송은 아래 관리 화면에서 합니다. 저장·게시는 발송이 아닙니다.",
            fallbackEn:
              "Separate Push delivery from the in-app notification inbox. This page explains and links only — send from the management screens below. Save/Publish is not Send.",
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
              fallbackKo: "Push 알림",
              fallbackEn: "Push notification",
            })}
          </div>
          <p className="mt-1 text-xs text-sam-muted">
            {safeT("admin_promotion_channel_push_desc", {
              fallbackKo:
                "기기 알림으로 전달합니다. 이벤트 노출 설정에서 초안을 만들고, 실제 발송은 Push 보내기로 합니다.",
              fallbackEn:
                "Delivered to the device. Draft from Event exposure settings; dispatch with Send push.",
            })}
          </p>
          <ul className="mt-2 list-inside list-disc text-[11px] text-sam-muted">
            <li>{lang === "en" ? "Channel: device Push" : "채널: 기기 Push"}</li>
            <li>{lang === "en" ? "Save ≠ Send" : "저장 ≠ 발송"}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionLink
              href={NOTIFICATIONS_SEND_HREF}
              variant="primary"
              data-admin-promotion-push-send="1"
            >
              {promotionAdminActionLabel("SEND_PUSH", lang)}
            </AdminActionLink>
            <AdminActionLink href="/admin/notifications/create" variant="secondary">
              {safeT("admin_promotion_create_push_draft", {
                fallbackKo: "Push 초안 만들기",
                fallbackEn: "Create push draft",
              })}
            </AdminActionLink>
            <AdminActionLink href="/admin/platform-events" variant="quiet">
              {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
            </AdminActionLink>
          </div>
        </div>

        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="bell"
        >
          <div className="font-semibold">
            {safeT("admin_promotion_channel_bell", {
              fallbackKo: "앱 알림함",
              fallbackEn: "In-app notification inbox",
            })}
          </div>
          <p className="mt-1 text-xs text-sam-muted">
            {safeT("admin_promotion_channel_bell_desc", {
              fallbackKo:
                "앱 안 알림함(벨)에 남기는 알림입니다. Push와 다릅니다. 이벤트 노출 설정에서 구성하고, 등록/관리는 알림 캠페인에서 합니다.",
              fallbackEn:
                "Persistent in-app inbox (bell). Not the same as Push. Configure on Event exposure; register/manage via notification campaigns.",
            })}
          </p>
          <ul className="mt-2 list-inside list-disc text-[11px] text-sam-muted">
            <li>{lang === "en" ? "Channel: in-app Bell" : "채널: 앱 알림함"}</li>
            <li>
              {lang === "en"
                ? "Requested on Event ≠ automatically sent"
                : "이벤트 설정 ≠ 자동 등록"}
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionLink
              href={NOTIFICATIONS_SEND_HREF}
              variant="secondary"
              data-admin-promotion-bell-manage="1"
            >
              {safeT("admin_promotion_bell_manage", {
                fallbackKo: "앱 알림함 등록/관리",
                fallbackEn: "Register / manage inbox",
              })}
            </AdminActionLink>
            <AdminActionLink href="/admin/platform-events" variant="quiet">
              {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
            </AdminActionLink>
          </div>
        </div>
      </div>

      <p className="text-xs text-sam-muted" data-admin-promotion-notif-empty-hint="1">
        {safeT("admin_promotion_notifications_empty_hint", {
          fallbackKo:
            "설정된 이벤트 알림이 없다면 이벤트 노출 설정에서 Push·앱 알림 채널을 켠 뒤, 위 관리 화면에서 발송/등록하세요.",
          fallbackEn:
            "If no event notifications are set, enable Push/Bell on Event exposure, then send/register from the screens above.",
        })}
      </p>
    </div>
  );
}
