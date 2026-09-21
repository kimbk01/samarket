"use client";

import Link from "next/link";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  NOTIFICATIONS_CREATE_HREF,
  NOTIFICATIONS_SEND_HREF,
  adminActionQueueIsNotNotificationDeliveryCopy,
} from "@/lib/admin/promotion-ownership-visibility";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";

/**
 * Promotion → Notifications hub.
 * Push vs Bell operational clarity only. SAVE ≠ SEND. No duplicate send engine.
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
              "같은 이벤트에서 나갈 수 있지만, Push와 앱 알림함은 서로 다른 전달 채널입니다. 이 화면은 안내·상태 이해·관리 화면 연결만 하며, 실제 발송/등록 엔진을 새로 만들지 않습니다.",
            fallbackEn:
              "They may share an Event, but Push and the in-app inbox are different delivery channels. This page explains and links only — it does not invent a new send engine.",
          })}
        </p>
      </div>

      <div
        className="rounded-ui-rect border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-sam-muted"
        data-admin-promotion-save-not-send="1"
      >
        {safeT("admin_promotion_notifications_save_not_send", {
          fallbackKo:
            "이벤트 저장 · 게시 · 배포 저장 · Push 초안 저장만으로는 Push가 발송되지 않습니다. 발송은 「Push 보내기」만 합니다.",
          fallbackEn:
            "Event save, publish, Dist save, and Push draft save never dispatch Push. Only 「Send push」 does.",
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="push"
        >
          <h2 className="text-base font-semibold">
            {safeT("admin_promotion_channel_push", {
              fallbackKo: "Push 알림",
              fallbackEn: "Push notification",
            })}
          </h2>
          <p className="mt-1 text-sm text-sam-muted" data-admin-promotion-push-explain="1">
            {safeT("admin_promotion_channel_push_desc", {
              fallbackKo: "휴대폰 시스템 알림으로 즉시 또는 예약 전달합니다.",
              fallbackEn: "Delivers immediately or on a schedule as a phone system notification.",
            })}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-sam-muted">
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Event" : "이벤트"}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_push_event_optional", {
                  fallbackKo: "선택 — 이벤트 없이 독립 캠페인도 가능",
                  fallbackEn: "Optional — standalone campaigns allowed",
                })}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Status truth" : "상태 의미"}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_push_status_truth", {
                  fallbackKo: "발송 완료 = 엔진 발송 기록 (기기 전달·열람과 동일하지 않음)",
                  fallbackEn: "Sent = engine dispatch record (not proof of device delivery/open)",
                })}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Owner" : "관리"}:{" "}
              </dt>
              <dd className="inline">/admin/notifications</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionLink
              href={NOTIFICATIONS_SEND_HREF}
              variant="primary"
              data-admin-promotion-push-send="1"
            >
              {promotionAdminActionLabel("SEND_PUSH", lang)}
            </AdminActionLink>
            <AdminActionLink
              href={NOTIFICATIONS_CREATE_HREF}
              variant="secondary"
              data-admin-promotion-push-draft="1"
            >
              {safeT("admin_promotion_create_push_draft", {
                fallbackKo: "Push 초안 만들기",
                fallbackEn: "Create push draft",
              })}
            </AdminActionLink>
            <AdminActionLink href="/admin/platform-events" variant="quiet">
              {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
            </AdminActionLink>
          </div>
          <p
            className="mt-3 text-xs text-sam-muted"
            data-admin-promotion-push-empty="1"
          >
            {safeT("admin_promotion_push_empty", {
              fallbackKo: "설정된 Push 알림이 없습니다. 이벤트 노출 설정 또는 Push 초안에서 구성하세요.",
              fallbackEn:
                "No Push notifications configured. Use Event exposure settings or create a Push draft.",
            })}
          </p>
        </section>

        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="bell"
        >
          <h2 className="text-base font-semibold">
            {safeT("admin_promotion_channel_bell", {
              fallbackKo: "앱 알림함",
              fallbackEn: "In-app notification inbox",
            })}
          </h2>
          <p className="mt-1 text-sm text-sam-muted" data-admin-promotion-bell-explain="1">
            {safeT("admin_promotion_channel_bell_desc", {
              fallbackKo:
                "dibaY 앱 안의 알림함에 남겨 사용자가 다시 확인할 수 있습니다.",
              fallbackEn:
                "Leaves an item in the dibaY in-app notification inbox for later review.",
            })}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-sam-muted">
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Event" : "이벤트"}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_event_optional", {
                  fallbackKo: "선택 — 이벤트 없이 독립 캠페인도 가능",
                  fallbackEn: "Optional — standalone campaigns allowed",
                })}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Dist save" : "배포 저장"}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_dist_truth", {
                  fallbackKo: "캠페인 초안만 생성 · 회원 알림함 행은 캠페인 등록/발송 시",
                  fallbackEn: "Creates campaign draft only · inbox rows on campaign send/register",
                })}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {lang === "en" ? "Action" : "동작"}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_action_label", {
                  fallbackKo: "앱 알림함 등록/관리 (Push 「보내기」와 다름)",
                  fallbackEn: "Register / manage inbox (not the same as Send push)",
                })}
              </dd>
            </div>
          </dl>
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
          <p
            className="mt-3 text-xs text-sam-muted"
            data-admin-promotion-bell-empty="1"
          >
            {safeT("admin_promotion_bell_empty", {
              fallbackKo:
                "설정된 앱 알림함 항목이 없습니다. 이벤트 노출 설정에서 켠 뒤 알림 캠페인에서 등록하세요.",
              fallbackEn:
                "No inbox items configured. Enable on Event exposure, then register via notification campaigns.",
            })}
          </p>
        </section>
      </div>

      <div
        className="rounded-ui-rect border border-sam-border bg-sam-app/40 px-3 py-2 text-xs text-sam-muted"
        data-admin-promotion-action-queue-note="1"
      >
        {adminActionQueueIsNotNotificationDeliveryCopy(lang)}
      </div>

      <p className="text-xs text-sam-muted" data-admin-promotion-notif-empty-hint="1">
        {safeT("admin_promotion_notifications_empty_hint", {
          fallbackKo:
            "이벤트에서 Push·앱 알림함을 함께 쓰려면 이벤트 노출 설정에서 각 채널을 따로 켠 뒤, 위 알림 캠페인에서 발송/등록하세요.",
          fallbackEn:
            "To use Push and Bell from one Event, enable each channel separately on Event exposure, then send/register from the notification campaigns above.",
        })}{" "}
        <Link href="/admin/platform-events" className="underline">
          {lang === "en" ? "Open Events" : "이벤트 열기"}
        </Link>
      </p>
    </div>
  );
}
