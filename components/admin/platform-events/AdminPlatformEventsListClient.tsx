"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
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
import { AdminManagementTableViewport } from "@/components/admin/management/AdminManagementTableViewport";

type ListEventRow = PlatformEventRow & { channelSummary?: string };

/** 표준 관리자 표 셀 (CommunityTable 과 같은 간격) */
const TH = "whitespace-nowrap px-3 py-2 font-semibold";
const TD = "px-3 py-2 align-top";

/**
 * 이벤트 목록 (R7) — 서버 페이지(`limit`/`offset` → `total`) · 쪽·크기는 주소에 보존.
 * 필터 없음(8 N/A) — API 가 검색·상태 파라미터를 받지 않는 서버 페이지 조회. 불러오기 실패 시 직전 목록은 지우지 않는다.
 * 목록은 표(제목·상태·기간·채널·목적지·수정·관리)로 보여 준다.
 */
export function AdminPlatformEventsListClient() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const ko = lang !== "en";
  /** G-18: 이벤트 만들기(POST) = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/platform-events");
  const lq = useAdminListQuery();
  const [events, setEvents] = useState<ListEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const { refreshKey, apiQueryString } = lq;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/platform-events?${apiQueryString}`, { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          events?: ListEventRow[];
          total?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError({ code: json.error || "load_failed", httpStatus: res.status });
          return;
        }
        const rows = json.events ?? [];
        setEvents(rows);
        setTotal(typeof json.total === "number" ? json.total : rows.length);
        setLoaded(true);
      } catch {
        if (!cancelled) setError({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey = apiQueryString + 새로고침 횟수
  }, [apiQueryString, refreshKey]);

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
        {adminAction.allowed ? (
          <AdminActionLink
            href="/admin/platform-events/new"
            variant="primary"
            data-admin-event-create-cta="1"
          >
            {promotionAdminActionLabel("CREATE", lang)}
          </AdminActionLink>
        ) : (
          <AdminActionButton
            variant="primary"
            disabled
            title={adminAction.reason ?? undefined}
            data-admin-event-create-cta="1"
          >
            {promotionAdminActionLabel("CREATE", lang)}
          </AdminActionButton>
        )}
      </div>
      {!adminAction.allowed && adminAction.reason ? (
        <p className="text-[12px] text-sam-muted" data-admin-action-denied="1">
          {adminAction.reason}
        </p>
      ) : null}

      {error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={lq.refresh} />
      ) : null}
      {loading && !loaded ? (
        <AdminLoadingState ko={ko} />
      ) : !loaded ? null : events.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={safeT("admin_platform_events_empty", {
            fallbackKo: "등록된 이벤트가 없습니다.",
            fallbackEn: "No events yet.",
          })}
        />
      ) : (
        <>
        <AdminManagementTableViewport>
          <table className="min-w-full border-collapse text-[13px]" data-admin-event-table="1">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
                <th className={TH}>{lang === "en" ? "Event" : "이벤트"}</th>
                <th className={TH}>{lang === "en" ? "Status" : "상태"}</th>
                <th className={TH}>{lang === "en" ? "Schedule" : "기간"}</th>
                <th className={TH}>{lang === "en" ? "Channels" : "채널"}</th>
                <th className={TH}>{lang === "en" ? "Destination" : "목적지"}</th>
                <th className={TH}>{lang === "en" ? "Updated" : "수정"}</th>
                <th className={`${TH} text-right`}>{lang === "en" ? "Actions" : "관리"}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const op = resolveEventOperatorStatus({
                  status: ev.status,
                  startsAt: ev.startsAt,
                  endsAt: ev.endsAt,
                });
                return (
                  <tr
                    key={ev.id}
                    className={`border-b border-sam-border last:border-b-0 ${adminOperatorRowClassFromPromotionStatus(op)}`}
                    data-admin-event-row={ev.id}
                    data-admin-op-status={op}
                  >
                    <td className={`${TD} min-w-[220px]`}>
                      <Link
                        href={eventEditHref(ev.id)}
                        className="block text-[14px] font-semibold text-sam-fg hover:underline"
                        data-admin-event-edit-link="1"
                      >
                        {ev.title}
                      </Link>
                      {/* 보조 정보 — 보관·고정·카테고리·정렬·썸네일 누락 */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sam-muted">
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
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                        {promotionOperatorStatusLabel(op, lang)}
                      </AdminToneBadge>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-sam-muted`}>
                      {formatPromotionAdminSchedule(ev.startsAt, lang)} –{" "}
                      {formatPromotionAdminSchedule(ev.endsAt, lang)}
                    </td>
                    <td className={`${TD} text-sam-muted`} data-admin-event-channel-summary="1">
                      {ev.channelSummary ??
                        (lang === "en" ? "No channels" : "채널 없음")}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-sam-muted`}>
                      {lang === "en" ? "Event detail" : "이벤트 상세"}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-sam-muted`}>
                      {ev.updatedAt ? formatPromotionAdminSchedule(ev.updatedAt, lang) : "—"}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <AdminActionLink href={eventPreviewHref(ev.id)} variant="ghost" size="sm">
                          {promotionAdminActionLabel("PREVIEW", lang)}
                        </AdminActionLink>
                        <AdminActionLink
                          href={eventDistributionHref(ev.id)}
                          variant="ghost"
                          size="sm"
                          data-admin-event-exposure-cta="1"
                        >
                          {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
                        </AdminActionLink>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminManagementTableViewport>
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
        </>
      )}
    </div>
  );
}
