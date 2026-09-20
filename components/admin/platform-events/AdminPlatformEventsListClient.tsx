"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import type { PlatformEventRow } from "@/lib/platform-events/types";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolveEventOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";
import {
  eventDistributionHref,
  eventEditHref,
  eventIsContentDestinationCopy,
  eventPreviewHref,
} from "@/lib/admin/promotion-ownership-visibility";

type ListEventRow = PlatformEventRow & { channelSummary?: string };

export function AdminPlatformEventsListClient() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [events, setEvents] = useState<ListEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-events", { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        events?: ListEventRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(
          json.error
            ? lang === "en"
              ? "Could not load events. Try again."
              : "이벤트를 불러오지 못했습니다. 다시 시도해 주세요."
            : lang === "en"
              ? "Could not load events."
              : "이벤트를 불러오지 못했습니다."
        );
        setEvents([]);
        return;
      }
      setEvents(json.events ?? []);
    } catch {
      setError(
        lang === "en" ? "Could not load events." : "이벤트를 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-platform-events-list="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {safeT("admin_platform_events_title", {
              fallbackKo: "이벤트",
              fallbackEn: "Events",
            })}
          </h1>
          <p
            className="mt-1 max-w-2xl text-sm text-sam-muted"
            data-admin-event-architecture-note="1"
          >
            {safeT("admin_platform_events_list_desc", {
              fallbackKo: eventIsContentDestinationCopy("ko"),
              fallbackEn: eventIsContentDestinationCopy("en"),
            })}
          </p>
        </div>
        <AdminActionLink
          href="/admin/platform-events/new"
          variant="primary"
          data-admin-event-create-cta="1"
        >
          {promotionAdminActionLabel("CREATE", lang)}
        </AdminActionLink>
      </div>

      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : events.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4">
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_events_empty", {
              fallbackKo: "등록된 이벤트가 없습니다.",
              fallbackEn: "No events yet.",
            })}
          </p>
          <AdminActionLink
            href="/admin/platform-events/new"
            variant="primary"
            className="mt-3"
          >
            {promotionAdminActionLabel("CREATE", lang)}
          </AdminActionLink>
        </div>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {events.map((ev) => {
            const op = resolveEventOperatorStatus({
              status: ev.status,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
            });
            return (
              <li key={ev.id} className="px-3 py-2.5" data-admin-event-row={ev.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{ev.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-sam-muted">
                      <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                        {promotionOperatorStatusLabel(op, lang)}
                      </AdminToneBadge>
                      <span>
                        {formatPromotionAdminSchedule(ev.startsAt, lang)} –{" "}
                        {formatPromotionAdminSchedule(ev.endsAt, lang)}
                      </span>
                      <span data-admin-event-channel-summary="1">
                        {ev.channelSummary ??
                          (lang === "en" ? "No channels" : "채널 없음")}
                      </span>
                      <span>
                        {lang === "en" ? "Destination" : "목적지"}:{" "}
                        {lang === "en" ? "Event detail" : "이벤트 상세"}
                      </span>
                      {ev.updatedAt ? (
                        <span>
                          {lang === "en" ? "Updated" : "수정"}:{" "}
                          {formatPromotionAdminSchedule(ev.updatedAt, lang)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <AdminActionLink href={eventPreviewHref(ev.id)} variant="secondary">
                      {promotionAdminActionLabel("PREVIEW", lang)}
                    </AdminActionLink>
                    <AdminActionLink href={eventEditHref(ev.id)} variant="secondary">
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </AdminActionLink>
                    <AdminActionLink
                      href={eventDistributionHref(ev.id)}
                      variant="secondary"
                      data-admin-event-exposure-cta="1"
                    >
                      {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
                    </AdminActionLink>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
