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
import { formatCampaignTime } from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";

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

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function sendModeLabel(t: TFn, mode: string | undefined): string {
  if (mode === "scheduled") return t("admin_notif_send_mode_scheduled");
  if (mode === "recurring") return t("admin_notif_send_mode_recurring");
  return t("admin_notif_send_mode_immediate");
}

/** 「발송 완료」 — delivered counts of the latest occurrence (push devices · in-app members). */
function formatDelivered(occ: LatestOccurrence | null | undefined, lang: "ko" | "en"): string {
  if (!occ) return "—";
  const push = `${occ.push_sent ?? 0}/${occ.push_device_count ?? 0}`;
  const inApp = `${occ.in_app_sent ?? 0}/${occ.in_app_member_count ?? 0}`;
  return lang === "en" ? `Push ${push} · In-app ${inApp}` : `푸시 ${push} · 인앱 ${inApp}`;
}

/** 「열람」 — deliveries marked opened (existing open tracking). */
function formatOpened(row: CampaignRow, lang: "ko" | "en"): string {
  if (!row.opened) return "—";
  const suffix = row.opened.capped ? "+" : "";
  return lang === "en"
    ? `Push ${row.opened.push}${suffix} · In-app ${row.opened.in_app}${suffix}`
    : `푸시 ${row.opened.push}${suffix} · 인앱 ${row.opened.in_app}${suffix}`;
}

function formatRunTimes(t: TFn, row: CampaignRow): string {
  const occ = row.latest_occurrence;
  const parts: string[] = [];
  const next = occ?.scheduled_for ?? row.scheduled_at;
  if (next && occ?.status === "queued") {
    parts.push(t("admin_notif_run_next", { time: formatCampaignTime(next) }));
  }
  const last = occ?.completed_at ?? row.sent_at;
  if (last) {
    parts.push(t("admin_notif_run_last", { time: formatCampaignTime(last) }));
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
  const [err, setErr] = useState<string | null>(null);

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
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_load_list"));
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(j.campaigns ?? []);
      setTotal(typeof j.total === "number" ? j.total : (j.campaigns ?? []).length);
      setArchiveSupported(j.archive_supported !== false);
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
            typeLabel: lang === "en" ? "Event" : "이벤트",
            title: resolved,
            href: eventEditHref(eventId),
            unresolved: false,
          };
        }
        return {
          kind: "platform_event_unresolved" as const,
          contentId: eventId,
          typeLabel: lang === "en" ? "Event" : "이벤트",
          title: lang === "en" ? "Source unavailable" : "원본 확인 불가",
          href: eventEditHref(eventId),
          unresolved: true,
        };
      }
      const contentId = readLinkedContentId(row.target_payload);
      if (!contentId) return null;
      const notice = noticeMap[contentId];
      const ct = parseCustomerCenterContentType(notice?.content_type ?? row.type, "notice");
      const typeLabel = BOARD_LABEL[ct][lang];
      const title = notice?.title?.trim() || contentId.slice(0, 8) + "…";
      return {
        kind: "app_notice" as const,
        contentId,
        typeLabel,
        title,
        href: `/admin/app/notices/${encodeURIComponent(contentId)}`,
        unresolved: false,
      };
    };
  }, [noticeMap, eventTitleMap, lang]);

  const tabLabels = lang === "en" ? CAMPAIGN_TAB_LABEL_EN : CAMPAIGN_TAB_LABEL_KO;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const statusOptions = TAB_STATUS_OPTIONS[query.tab];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-sam-fg">{t("admin_notif_page_list")}</h1>
        <Link
          href="/admin/notifications/create"
          className="rounded-ui-rect bg-signature px-3 py-2 text-sm font-medium text-white"
        >
          {t("admin_notif_btn_new")}
        </Link>
      </div>

      {/* ADM-05 tabs: 작성 중 · 진행 중 · 완료 · 보관 · QA */}
      <div className="flex flex-wrap gap-1 border-b border-sam-border" role="tablist">
        {CAMPAIGN_LIST_TABS.map((tab) => {
          const active = tab === query.tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              data-admin-notif-tab={tab}
              onClick={() => pushQuery({ tab, status: null })}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active ? "border-signature font-semibold text-sam-fg" : "border-transparent text-sam-muted"
              }`}
            >
              {tabLabels[tab]}
            </button>
          );
        })}
      </div>

      {query.tab === "archived" && !archiveSupported ? (
        <p className="rounded-ui-rect border border-dashed border-sam-border px-3 py-2 text-sm text-sam-muted">
          {lang === "en"
            ? "Archive becomes available after the DB migration is applied."
            : "보관 기능은 DB 마이그레이션 적용 후 사용할 수 있습니다."}
        </p>
      ) : null}

      <form
        className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          pushQuery({ q: qDraft.trim() ? qDraft.trim().slice(0, 80) : null });
        }}
      >
        {statusOptions ? (
          <select
            value={query.status ?? "all"}
            onChange={(e) =>
              pushQuery({ status: e.target.value === "all" ? null : (e.target.value as CampaignListQuery["status"]) })
            }
            className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
            aria-label={t("admin_notif_th_status")}
          >
            <option value="all">{t("admin_notif_filter_status_all")}</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {campaignStatusLabel(s, lang)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={query.type ?? "all"}
          onChange={(e) =>
            pushQuery({ type: e.target.value === "all" ? null : (e.target.value as CampaignListQuery["type"]) })
          }
          className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
          aria-label={t("admin_notif_th_type")}
        >
          <option value="all">{t("admin_notif_filter_type_all")}</option>
          <option value="notice">{t("admin_notif_type_notice")}</option>
          <option value="marketing">{t("admin_notif_type_marketing")}</option>
          <option value="system">{t("admin_notif_type_system")}</option>
        </select>
        <input
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder={t("admin_notif_ph_title_search")}
          className="min-w-[160px] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm">
          {t("admin_notif_btn_search")}
        </button>
      </form>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
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
                <th className="px-3 py-2">{lang === "en" ? "Delivered" : "발송 완료"}</th>
                <th className="px-3 py-2">{lang === "en" ? "Opened" : "열람"}</th>
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
                        <span className="ml-2 rounded-ui-rect bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
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
                    <td className="px-3 py-2">{campaignStatusLabel(status, lang)}</td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted" data-admin-notif-col="delivered">
                      {formatDelivered(r.latest_occurrence, lang)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted" data-admin-notif-col="opened">
                      {formatOpened(r, lang)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">{formatRunTimes(t, r)}</td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">
                      {r.author_name ?? (r.created_by ? `${r.created_by.slice(0, 8)}…` : "—")}
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-sam-muted">
                    {t("admin_notif_empty_campaigns")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-sam-muted">
        <span>
          {lang === "en"
            ? `${total.toLocaleString("en-US")} total · page ${query.page}/${totalPages}`
            : `총 ${total.toLocaleString("ko-KR")}건 · ${query.page}/${totalPages} 페이지`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || query.page <= 1}
            onClick={() => pushQuery({ page: query.page - 1 }, { keepPage: true })}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-40"
          >
            {lang === "en" ? "Previous" : "이전"}
          </button>
          <button
            type="button"
            disabled={loading || query.page >= totalPages}
            onClick={() => pushQuery({ page: query.page + 1 }, { keepPage: true })}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-40"
          >
            {lang === "en" ? "Next" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
