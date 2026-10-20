"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
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
import { adminOperatorRowClassFromPromotionStatus } from "@/lib/admin/admin-operator-row-presentation";

type ListEventRow = PlatformEventRow & { channelSummary?: string };

export function AdminPlatformEventsListClient() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [events, setEvents] = useState<ListEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [httpStatus, setHttpStatus] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHttpStatus(undefined);
    try {
      const res = await fetch("/api/admin/platform-events", { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        events?: ListEventRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setHttpStatus(res.status);
        setEvents([]);
        return;
      }
      setEvents(json.events ?? []);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-platform-events-list="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold">
            {t("admin_menu_promotion_events")}
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
        <AdminLoadingState ko={lang !== "en"} />
      ) : error ? (
        <AdminErrorState ko={lang !== "en"} code={error} httpStatus={httpStatus} onRetry={() => void load()} />
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
              <li
                key={ev.id}
                className={`px-3 py-2.5 ${adminOperatorRowClassFromPromotionStatus(op)}`}
                data-admin-event-row={ev.id}
                data-admin-op-status={op}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{ev.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sam-muted">
                      <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                        {promotionOperatorStatusLabel(op, lang)}
                      </AdminToneBadge>
                      {ev.archivedAt ? (
                        <span data-admin-event-archived="1">
                          <AdminToneBadge tone="neutral">
                            {safeT("admin_platform_event_list_archived", {
                              fallbackKo: "보관됨",
                              fallbackEn: "Archived",
                            })}
                          </AdminToneBadge>
                        </span>
                      ) : null}
                      {ev.isPinned ? (
                        <span data-admin-event-pinned="1">
                          <AdminToneBadge tone="progress">
                            {safeT("platform_event_board_pinned", { fallbackKo: "고정", fallbackEn: "Pinned" })}
                          </AdminToneBadge>
                        </span>
                      ) : null}
                      {ev.category ? (
                        <span data-admin-event-category="1">
                          {safeT("admin_platform_event_list_category", {
                            fallbackKo: "카테고리",
                            fallbackEn: "Category",
                          })}
                          : {ev.category}
                        </span>
                      ) : null}
                      {typeof ev.sortOrder === "number" && ev.sortOrder !== 0 ? (
                        <span data-admin-event-sort-order="1">
                          {safeT("admin_platform_event_list_sort_order", {
                            fallbackKo: "정렬",
                            fallbackEn: "Order",
                          })}
                          : {ev.sortOrder}
                        </span>
                      ) : null}
                      {!ev.thumbnailUrl ? (
                        <span data-admin-event-thumbnail-missing="1">
                          {safeT("admin_platform_event_list_thumbnail_missing", {
                            fallbackKo: "게시판 썸네일 없음(대표 이미지 사용)",
                            fallbackEn: "No board thumbnail (hero image used)",
                          })}
                        </span>
                      ) : null}
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
