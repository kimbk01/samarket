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

export function AdminPlatformEventsListClient() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [events, setEvents] = useState<PlatformEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-events", { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        events?: PlatformEventRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setEvents([]);
        return;
      }
      setEvents(json.events ?? []);
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-platform-events-list="1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {safeT("admin_platform_events_title", {
            fallbackKo: "이벤트",
            fallbackEn: "Events",
          })}
        </h1>
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
        <p className="text-sm text-red-600">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_platform_events_empty", {
            fallbackKo: "등록된 이벤트가 없습니다.",
            fallbackEn: "No events yet.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {events.map((ev) => {
            const op = resolveEventOperatorStatus({
              status: ev.status,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
            });
            return (
              <li key={ev.id} className="px-3 py-3" data-admin-event-row={ev.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{ev.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sam-muted">
                      <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                        {promotionOperatorStatusLabel(op, lang)}
                      </AdminToneBadge>
                      <span>
                        {safeT("admin_promotion_schedule_start", {
                          fallbackKo: "노출 시작",
                          fallbackEn: "Starts",
                        })}
                        : {formatPromotionAdminSchedule(ev.startsAt, lang)}
                      </span>
                      <span>
                        {safeT("admin_promotion_schedule_end", {
                          fallbackKo: "노출 종료",
                          fallbackEn: "Ends",
                        })}
                        : {formatPromotionAdminSchedule(ev.endsAt, lang)}
                      </span>
                      {ev.updatedAt ? (
                        <span>
                          ·{" "}
                          {formatPromotionAdminSchedule(ev.updatedAt, lang)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <AdminActionLink
                      href={`/admin/platform-events/${encodeURIComponent(ev.id)}`}
                      variant="secondary"
                    >
                      {promotionAdminActionLabel("PREVIEW", lang)}
                    </AdminActionLink>
                    <AdminActionLink
                      href={`/admin/platform-events/${encodeURIComponent(ev.id)}`}
                      variant="secondary"
                    >
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </AdminActionLink>
                    <AdminActionLink
                      href={`/admin/platform-events/${encodeURIComponent(ev.id)}`}
                      variant="secondary"
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
