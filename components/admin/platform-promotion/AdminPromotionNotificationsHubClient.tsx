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
import { translateBy } from "@/lib/i18n/translate-by";

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
        <h1 className="text-[20px] font-semibold">
          {safeT("admin_menu_promotion_notifications")}
        </h1>
        <p
          className="mt-1 max-w-2xl text-sm text-sam-muted"
          data-admin-promotion-notifications-purpose="1"
        >
          {safeT("admin_promotion_notifications_desc")}
        </p>
      </div>

      <div
        className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft/70 px-3 py-2 text-xs text-sam-muted"
        data-admin-promotion-save-not-send="1"
      >
        {safeT("admin_promotion_notifications_save_not_send")}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="push"
        >
          <h2 className="text-base font-semibold">
            {safeT("admin_promotion_channel_push")}
          </h2>
          <p className="mt-1 text-sm text-sam-muted" data-admin-promotion-push-explain="1">
            {safeT("admin_promotion_channel_push_desc")}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-sam-muted">
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_event")}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_push_event_optional")}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_status_truth")}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_push_status_truth")}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_owner")}:{" "}
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
              {safeT("admin_promotion_create_push_draft")}
            </AdminActionLink>
            <AdminActionLink href="/admin/platform-events" variant="quiet">
              {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
            </AdminActionLink>
          </div>
          <p
            className="mt-3 text-xs text-sam-muted"
            data-admin-promotion-push-empty="1"
          >
            {safeT("admin_promotion_push_empty")}
          </p>
        </section>

        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-admin-promotion-channel="bell"
        >
          <h2 className="text-base font-semibold">
            {safeT("admin_promotion_channel_bell")}
          </h2>
          <p className="mt-1 text-sm text-sam-muted" data-admin-promotion-bell-explain="1">
            {safeT("admin_promotion_channel_bell_desc")}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-sam-muted">
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_event")}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_event_optional")}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_dist_save")}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_dist_truth")}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-sam-fg">
                {translateBy(lang, "admin_favorites_col_action")}:{" "}
              </dt>
              <dd className="inline">
                {safeT("admin_promotion_bell_action_label")}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionLink
              href={NOTIFICATIONS_SEND_HREF}
              variant="secondary"
              data-admin-promotion-bell-manage="1"
            >
              {safeT("admin_promotion_bell_manage")}
            </AdminActionLink>
            <AdminActionLink href="/admin/platform-events" variant="quiet">
              {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
            </AdminActionLink>
          </div>
          <p
            className="mt-3 text-xs text-sam-muted"
            data-admin-promotion-bell-empty="1"
          >
            {safeT("admin_promotion_bell_empty")}
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
        {safeT("admin_promotion_notifications_empty_hint")}{" "}
        <Link href="/admin/platform-events" className="underline">
          {translateBy(lang, "admin_open_events")}
        </Link>
      </p>
    </div>
  );
}
