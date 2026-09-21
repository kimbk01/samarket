"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  notifChannelLabel,
  notifStatusLabel,
  notifTargetLabel,
  notifTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
import {
  BOARD_LABEL,
  parseCustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { adminOperatorRowClassFromNotificationStatus } from "@/lib/admin/admin-operator-row-presentation";
import { eventEditHref } from "@/lib/admin/promotion-ownership-visibility";

type LatestOccurrence = {
  id?: string;
  status?: string;
  scheduled_for?: string | null;
  completed_at?: string | null;
  push_sent?: number;
  push_device_count?: number;
  in_app_sent?: number;
  in_app_member_count?: number;
};

type CampaignRow = {
  id: string;
  title: string;
  type: string;
  target_type: string;
  channel?: string;
  status: string;
  send_mode?: string;
  is_qa?: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  latest_occurrence?: LatestOccurrence | null;
  target_payload?: unknown;
};

type AudienceFilter = "ops" | "qa" | "all";

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

function formatResult(t: TFn, occ: LatestOccurrence | null | undefined): string {
  if (!occ) return "—";
  return t("admin_notif_result_metrics", {
    pushSent: occ.push_sent ?? 0,
    pushTotal: occ.push_device_count ?? 0,
    inAppSent: occ.in_app_sent ?? 0,
    inAppTotal: occ.in_app_member_count ?? 0,
  });
}

function formatRunTimes(t: TFn, row: CampaignRow): string {
  const occ = row.latest_occurrence;
  const parts: string[] = [];
  const next = occ?.scheduled_for ?? row.scheduled_at;
  if (next && occ?.status === "queued") {
    parts.push(t("admin_notif_run_next", { time: next.slice(0, 16) }));
  }
  const last = occ?.completed_at ?? row.sent_at;
  if (last) {
    parts.push(t("admin_notif_run_last", { time: last.slice(0, 16) }));
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

export function AdminNotificationCampaignsPage() {
  const { t, safeT, language } = useI18n();
  const [audience, setAudience] = useState<AudienceFilter>("ops");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [noticeMap, setNoticeMap] = useState<Record<string, NoticeLite>>({});
  const [eventTitleMap, setEventTitleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      sp.set("audience", audience);
      if (status !== "all") sp.set("status", status);
      if (type !== "all") sp.set("type", type);
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/notification-campaigns?${sp.toString()}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; campaigns?: CampaignRow[]; error?: string };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_load_list"));
        setRows([]);
        return;
      }
      setRows(j.campaigns ?? []);
    } finally {
      setLoading(false);
    }
    // `t` omitted on purpose: i18n boot recreates `t` and was re-triggering load → prolonged "불러오는 중…".
  }, [audience, status, type, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const langKey = language === "en" ? "en" : "ko";

  const linkedLabel = useMemo(() => {
    return (row: CampaignRow) => {
      const eventId = readLinkedPlatformEventId(row.target_payload);
      if (eventId) {
        const resolved = eventTitleMap[eventId]?.trim();
        if (resolved) {
          return {
            kind: "platform_event" as const,
            contentId: eventId,
            typeLabel: langKey === "en" ? "Event" : "이벤트",
            title: resolved,
            href: eventEditHref(eventId),
            unresolved: false,
          };
        }
        return {
          kind: "platform_event_unresolved" as const,
          contentId: eventId,
          typeLabel: langKey === "en" ? "Event" : "이벤트",
          title: langKey === "en" ? "Source unavailable" : "원본 확인 불가",
          href: eventEditHref(eventId),
          unresolved: true,
        };
      }
      const contentId = readLinkedContentId(row.target_payload);
      if (!contentId) return null;
      const notice = noticeMap[contentId];
      const ct = parseCustomerCenterContentType(notice?.content_type ?? row.type, "notice");
      const typeLabel = BOARD_LABEL[ct][langKey];
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
  }, [noticeMap, eventTitleMap, langKey]);

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

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as AudienceFilter)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="ops">{t("admin_notif_filter_audience_ops")}</option>
          <option value="qa">{t("admin_notif_filter_audience_qa")}</option>
          <option value="all">{t("admin_notif_filter_audience_all")}</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">{t("admin_notif_filter_status_all")}</option>
          <option value="draft">{t("admin_notif_status_draft")}</option>
          <option value="scheduled">{t("admin_notif_status_scheduled")}</option>
          <option value="active">{t("admin_notif_status_active")}</option>
          <option value="sending">{t("admin_notif_status_sending")}</option>
          <option value="sent">{t("admin_notif_status_sent")}</option>
          <option value="partially_failed">{t("admin_notif_status_partially_failed")}</option>
          <option value="failed">{t("admin_notif_status_failed")}</option>
          <option value="cancelled">{t("admin_notif_status_cancelled")}</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        >
          <option value="all">{t("admin_notif_filter_type_all")}</option>
          <option value="notice">{t("admin_notif_type_notice")}</option>
          <option value="marketing">{t("admin_notif_type_marketing")}</option>
          <option value="system">{t("admin_notif_type_system")}</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("admin_notif_ph_title_search")}
          className="min-w-[160px] flex-1 rounded border border-sam-border bg-sam-app px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm"
        >
          {t("admin_notif_btn_search")}
        </button>
      </div>

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
                <th className="px-3 py-2">{t("admin_notif_th_result")}</th>
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
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-sam-border-soft ${adminOperatorRowClassFromNotificationStatus(r.status)}`}
                    data-admin-notif-status={r.status}
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
                    <td className="px-3 py-2">{notifStatusLabel(t, r.status)}</td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">{formatResult(t, r.latest_occurrence)}</td>
                    <td className="px-3 py-2 text-[12px] text-sam-muted">{formatRunTimes(t, r)}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-sam-muted">
                      {r.created_by ? `${r.created_by.slice(0, 8)}…` : "—"}
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
                  <td colSpan={11} className="px-3 py-8 text-center text-sam-muted">
                    {t("admin_notif_empty_campaigns")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
