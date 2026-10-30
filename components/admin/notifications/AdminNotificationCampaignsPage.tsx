"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  notifChannelLabel,
  notifTargetLabel,
  notifTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
import {
  BOARD_LABEL,
  parseCustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { adminOperatorRowClassFromNotificationStatus } from "@/lib/admin/admin-operator-row-presentation";
import { eventEditHref } from "@/lib/admin/promotion-ownership-visibility";
import {
  CAMPAIGN_LIST_TABS,
  CAMPAIGN_TAB_LABEL_EN,
  CAMPAIGN_TAB_LABEL_KO,
  CAMPAIGN_TAB_STATUSES,
  campaignListQueryToSearchParams,
  campaignStatusLabel,
  parseCampaignListQuery,
  type CampaignListQuery,
  type CampaignListTab,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { AdminTechId, formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { isInboxDetailDestinationPayload } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { NOTIFICATIONS_CAMPAIGN_STATUS_NS } from "@/lib/admin/status-labels/notifications-status-labels";

type LatestOccurrence = {
  id?: string;
  status?: string;
  trigger_type?: string;
  scheduled_for?: string | null;
  completed_at?: string | null;
  push_sent?: number;
  push_device_count?: number;
  in_app_sent?: number;
  in_app_member_count?: number;
  last_error?: string | null;
};

type CampaignRow = {
  id: string;
  title: string;
  type: string;
  target_type: string;
  channel?: string;
  status: string;
  effective_status?: string;
  send_mode?: string;
  is_qa?: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  author_name?: string | null;
  archived_at?: string | null;
  latest_occurrence?: LatestOccurrence | null;
  opened?: { push: number; in_app: number; capped?: boolean } | null;
  target_payload?: unknown;
};

type NoticeLite = {
  id: string;
  title: string;
  content_type?: string | null;
};

import type { MessageKey } from "@/lib/i18n/messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function sendModeLabel(t: TFn, mode: string | undefined): string {
  if (mode === "scheduled") return t("admin_notif_send_mode_scheduled");
  if (mode === "recurring") return t("admin_notif_send_mode_recurring");
  return t("admin_notif_send_mode_immediate");
}

/** 「발송 완료」 — delivered counts of the latest occurrence (push devices · in-app members). */
function formatDelivered(occ: LatestOccurrence | null | undefined, lang: "ko" | "en"): string {
  if (!occ) return "—";
  const push = `${formatAdminNumber(occ.push_sent ?? 0)}/${formatAdminNumber(occ.push_device_count ?? 0)}`;
  const inApp = `${formatAdminNumber(occ.in_app_sent ?? 0)}/${formatAdminNumber(occ.in_app_member_count ?? 0)}`;
  return safeTranslate(lang, "admin_campaign_cms_push_in_app_counts", { fallbackKo: `푸시 ${push} · 인앱 ${inApp}`, fallbackEn: `Push ${push} · In-app ${inApp}`, vars: { push, in_app: inApp } });
}

/** 「열람」 — deliveries marked opened (existing open tracking). */
function formatOpened(row: CampaignRow, lang: "ko" | "en"): string {
  if (!row.opened) return "—";
  const suffix = row.opened.capped ? "+" : "";
  const push = `${formatAdminNumber(row.opened.push)}${suffix}`;
  const inApp = `${formatAdminNumber(row.opened.in_app)}${suffix}`;
  return safeTranslate(lang, "admin_campaign_cms_push_in_app_counts", { fallbackKo: `푸시 ${push} · 인앱 ${inApp}`, fallbackEn: `Push ${push} · In-app ${inApp}`, vars: { push, in_app: inApp } });
}

function formatRunTimes(t: TFn, row: CampaignRow): string {
  const occ = row.latest_occurrence;
  const parts: string[] = [];
  const next = occ?.scheduled_for ?? row.scheduled_at;
  if (next && occ?.status === "queued") {
    parts.push(t("admin_notif_run_next", { time: formatAdminManilaDateTime(next) }));
  }
  const last = occ?.completed_at ?? row.sent_at;
  if (last) {
    parts.push(t("admin_notif_run_last", { time: formatAdminManilaDateTime(last) }));
  }
  return parts.length ? parts.join(" · ") : "—";
}

function readLinkedContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

/** Platform Event source identity (Event Dist Push/Bell) — not app-notice content_id. */
export function readLinkedPlatformEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.platform_event_id === "string") return p.platform_event_id.trim();
  return "";
}

const TAB_STATUS_OPTIONS: Partial<Record<CampaignListTab, readonly string[]>> = {
  in_progress: CAMPAIGN_TAB_STATUSES.in_progress,
  completed: CAMPAIGN_TAB_STATUSES.completed,
};

export function AdminNotificationCampaignsPage() {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  // IA-01: 실제 수신자 발송·예약 = `manage` 키 — 초안 작성은 누구나, 발송 불가면 목록에서 미리 안내
  const sendAction = useAdminRouteAction("/admin/notifications");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // ADM-05: tab · filters · page live in the URL (shareable, back/forward safe).
  const query = useMemo(
    () => parseCampaignListQuery(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams]
  );
  const [qDraft, setQDraft] = useState(query.q ?? "");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [total, setTotal] = useState(0);
  const [archiveSupported, setArchiveSupported] = useState(true);
  const [noticeMap, setNoticeMap] = useState<Record<string, NoticeLite>>({});
  const [eventTitleMap, setEventTitleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const ko = lang !== "en";

  useEffect(() => {
    setQDraft(query.q ?? "");
  }, [query.q]);

  const pushQuery = useCallback(
    (next: Partial<CampaignListQuery>, opts?: { keepPage?: boolean }) => {
      const merged: CampaignListQuery = { ...query, ...next, ...(opts?.keepPage ? {} : { page: next.page ?? 1 }) };
      const sp = campaignListQueryToSearchParams(merged).toString();
      router.replace(sp ? `${pathname}?${sp}` : pathname, { scroll: false });
    },
    [query, router, pathname]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-notices", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: NoticeLite[];
        };
        if (cancelled || !res.ok || !j.ok || !Array.isArray(j.notices)) return;
        const map: Record<string, NoticeLite> = {};
        for (const n of j.notices) {
          if (n?.id) map[n.id] = n;
        }
        setNoticeMap(map);
      } catch {
        /* optional join — list still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/platform-events", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          events?: Array<{ id?: string; title?: string }>;
        };
        if (cancelled || !res.ok || !j.ok || !Array.isArray(j.events)) return;
        const map: Record<string, string> = {};
        for (const ev of j.events) {
          if (ev?.id && ev.title) map[ev.id] = ev.title;
        }
        setEventTitleMap(map);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apiQueryString = campaignListQueryToSearchParams(query).toString();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/notification-campaigns?${apiQueryString}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: CampaignRow[];
        total?: number;
        archive_supported?: boolean;
        error?: string;
      };
      if (!res.ok || !j?.ok) {
        setErr({ code: typeof j?.error === "string" ? j.error : "load_failed", httpStatus: res.status });
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(j.campaigns ?? []);
      setTotal(typeof j.total === "number" ? j.total : (j.campaigns ?? []).length);
      setArchiveSupported(j.archive_supported !== false);
    } catch {
      setErr({ code: "network_error" });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // `t` omitted on purpose: i18n boot recreates `t` and was re-triggering load → prolonged "불러오는 중…".
  }, [apiQueryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const linkedLabel = useMemo(() => {
    return (row: CampaignRow) => {
      const eventId = readLinkedPlatformEventId(row.target_payload);
      if (eventId) {
        const resolved = eventTitleMap[eventId]?.trim();
        if (resolved) {
          return {
            kind: "platform_event" as const,
            contentId: eventId,
            typeLabel: safeT("admin_campaign_cms_linked_type_event", { fallbackKo: "이벤트", fallbackEn: "Event" }),
            title: resolved,
            href: eventEditHref(eventId),
            unresolved: false,
          };
        }
        return {
          kind: "platform_event_unresolved" as const,
          contentId: eventId,
          typeLabel: safeT("admin_campaign_cms_linked_type_event", { fallbackKo: "이벤트", fallbackEn: "Event" }),
          title: safeT("admin_campaign_cms_linked_source_unavailable", { fallbackKo: "원본 확인 불가", fallbackEn: "Source unavailable" }),
          href: eventEditHref(eventId),
          unresolved: true,
        };
      }
      const contentId = readLinkedContentId(row.target_payload);
      if (!contentId) return null;
      const notice = noticeMap[contentId];
      const ct = parseCustomerCenterContentType(notice?.content_type ?? row.type, "notice");
      const typeLabel = BOARD_LABEL[ct][lang];
      const title = notice?.title?.trim() || formatAdminShortIdEllipsis(contentId);
      return {
        kind: "app_notice" as const,
        contentId,
        typeLabel,
        title,
        href: `/admin/app/notices/${encodeURIComponent(contentId)}`,
        unresolved: false,
      };
    };
  }, [noticeMap, eventTitleMap, lang, safeT]);

  const tabLabels = lang === "en" ? CAMPAIGN_TAB_LABEL_EN : CAMPAIGN_TAB_LABEL_KO;
  const statusOptions = TAB_STATUS_OPTIONS[query.tab];
  const hasFilters = Boolean(query.status || query.type || query.q);
  const resetFilters = () => {
    setQDraft("");
    pushQuery({ status: null, type: null, q: null });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-sam-fg">{t("admin_menu_dibay_notification_campaigns")}</h1>
        {/* 화면의 primary 는 필터 바 [조회] 하나 — 생성은 헤더 오른쪽 보조 (R7 버튼 배치). */}
        <AdminActionLink href="/admin/notifications/create" variant="secondary">
          {t("admin_notif_btn_new")}
        </AdminActionLink>
      </div>
      {!sendAction.allowed && sendAction.reason ? (
        <p className="text-[13px] text-sam-muted" data-admin-action-denied="1">
          {lang === "ko"
            ? `초안 작성·본인 테스트 발송만 가능합니다. 실제 발송·예약 비활성: ${sendAction.reason}`
            : `Drafts and self test-send only. Send/schedule disabled: ${sendAction.reason}`}
        </p>
      ) : null}

      {/* ADM-05 tabs: 작성 중 · 진행 중 · 완료 · 보관 · QA */}
      <AdminTabs
        ariaLabel={t("admin_menu_dibay_notification_campaigns")}
        tabs={CAMPAIGN_LIST_TABS.map((tab) => ({ id: tab, label: tabLabels[tab] }))}
        value={query.tab}
        syncUrl={false}
        onChange={(tab) => pushQuery({ tab: tab as CampaignListTab, status: null })}
      />

      {query.tab === "archived" && !archiveSupported ? (
        <p className="rounded-ui-rect border border-dashed border-sam-border px-3 py-2 text-sm text-sam-muted">
          {safeT("admin_campaign_cms_archive_needs_migration", { fallbackKo: "보관 기능은 DB 마이그레이션 적용 후 사용할 수 있습니다.", fallbackEn: "Archive becomes available after the DB migration is applied." })}
        </p>
      ) : null}

      {/* R7 — 표준 필터 바. 조건은 기존 캠페인 목록 주소 계약(parseCampaignListQuery: tab·status·type·q·page·page_size)에 남는다. */}
      <AdminFilterBar
        ko={ko}
        draft={{ q: qDraft, from: "", to: "" }}
        onDraftChange={(p) => {
          if (p.q !== undefined) setQDraft(p.q);
        }}
        onSubmit={() => pushQuery({ q: qDraft.trim() ? qDraft.trim().slice(0, 80) : null })}
        onReset={resetFilters}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={t("admin_notif_ph_title_search")}
        status={
          statusOptions
            ? {
                value: query.status ?? "",
                label: t("admin_notif_th_status"),
                onChange: (v) => pushQuery({ status: v ? (v as CampaignListQuery["status"]) : null }),
                options: [
                  { value: "", label: t("admin_notif_filter_status_all") },
                  ...statusOptions.map((st) => ({ value: st, label: campaignStatusLabel(st, lang) })),
                ],
              }
            : undefined
        }
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {t("admin_notif_th_type")}
          <select
            value={query.type ?? "all"}
            onChange={(e) =>
              pushQuery({ type: e.target.value === "all" ? null : (e.target.value as CampaignListQuery["type"]) })
            }
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
          >
            <option value="all">{t("admin_notif_filter_type_all")}</option>
            <option value="notice">{t("admin_notif_type_notice")}</option>
            <option value="marketing">{t("admin_notif_type_marketing")}</option>
            <option value="system">{t("admin_notif_type_system")}</option>
          </select>
        </label>
      </AdminFilterBar>

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : err ? (
        <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={hasFilters ? undefined : t("admin_notif_empty_campaigns")}
          onReset={hasFilters ? resetFilters : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sam-border bg-sam-app text-[12px] text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_notif_th_title")}</th>
                <th className="px-3 py-2">
                  {safeT("admin_notif_th_linked_content", {
                    fallbackKo: "연결 원본",
                    fallbackEn: "Linked original",
                  })}
                </th>
                <th className="px-3 py-2">{t("admin_notif_th_type")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_target")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_channel")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_send_mode")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_status")}</th>
                <th className="px-3 py-2">{safeT("admin_campaign_cms_col_delivered", { fallbackKo: "발송 완료", fallbackEn: "Delivered" })}</th>
                <th className="px-3 py-2">{safeT("admin_campaign_cms_col_opened", { fallbackKo: "열람", fallbackEn: "Opened" })}</th>
                <th className="px-3 py-2">{t("admin_notif_th_run_times")}</th>
                <th className="px-3 py-2">{t("admin_notif_th_author")}</th>
                <th className="px-3 py-2">
                  {safeT("admin_notif_th_actions", {
                    fallbackKo: "작업",
                    fallbackEn: "Actions",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const linked = linkedLabel(r);
                const status = r.effective_status ?? r.status;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-sam-border-soft ${adminOperatorRowClassFromNotificationStatus(status)}`}
                    data-admin-notif-status={status}
                  >
                    <td className="px-3 py-2 font-medium text-sam-fg">
                      <Link href={`/admin/notifications/${r.id}`} className="hover:underline">
                        {r.title}
                      </Link>
                      {r.is_qa ? (
                        <span className="ml-2 rounded-ui-rect bg-sam-warning-soft px-1.5 py-0.5 text-[12px] text-sam-warning">
                          QA
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[12px]">
                      {linked ? (
                        <div className="space-y-0.5">
                          <p className="text-sam-fg">
                            <span className="text-sam-muted">{linked.typeLabel}</span> · {linked.title}
                          </p>
                          <Link
                            href={linked.href}
                            className="text-signature hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {safeT("admin_notif_btn_view_original", {
                              fallbackKo: "원본 보기",
                              fallbackEn: "View original",
                            })}
                          </Link>
                        </div>
                      ) : isInboxDetailDestinationPayload(r.target_payload) ? (
                        <span className="text-sam-fg">{lang === "en" ? "Notification detail" : "알림 내용 보기"}</span>
                      ) : (
                        <span className="text-sam-muted">
                          {safeT("admin_notif_legacy_unbound_human", {
                            fallbackKo: "이전 방식 · 원본 연결 없음",
                            fallbackEn: "Legacy · no linked source",
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{notifTypeLabel(t, r.type)}</td>
                    <td className="px-3 py-2">{notifTargetLabel(t, r.target_type)}</td>
                    <td className="px-3 py-2">{notifChannelLabel(t, r.channel ?? "push_and_in_app")}</td>
                    <td className="px-3 py-2">{sendModeLabel(t, r.send_mode)}</td>
                    <td className="px-3 py-2">
                      <AdminStatusLabel namespace={NOTIFICATIONS_CAMPAIGN_STATUS_NS} code={status} ko={ko} />
                    </td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted" data-admin-notif-col="delivered">
                      {formatDelivered(r.latest_occurrence, lang)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted" data-admin-notif-col="opened">
                      {formatOpened(r, lang)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">{formatRunTimes(t, r)}</td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">
                      {r.author_name ?? (r.created_by ? <AdminTechId id={r.created_by} /> : "—")}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/notifications/${r.id}`}
                        className="text-signature hover:underline"
                        data-admin-notif-manage="1"
                      >
                        {safeT("admin_notif_btn_manage", {
                          fallbackKo: "관리",
                          fallbackEn: "Manage",
                        })}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        ko={ko}
        page={query.page}
        size={normalizeAdminListPageSize(query.pageSize)}
        total={total}
        disabled={loading}
        onPageChange={(page) => pushQuery({ page }, { keepPage: true })}
        onSizeChange={(pageSize) => pushQuery({ pageSize })}
      />
    </div>
  );
}
