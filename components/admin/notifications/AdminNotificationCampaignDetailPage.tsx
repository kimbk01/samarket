"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
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

type CampaignSummary = {
  occurrence_id?: string;
  status?: string;
  target_member_count?: number;
  push_eligible_member_count?: number;
  push_device_count?: number;
  in_app_member_count?: number;
  push_sent?: number;
  push_skipped?: number;
  push_failed?: number;
  in_app_sent?: number;
  in_app_skipped?: number;
  in_app_failed?: number;
  scheduled_for?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type OccurrenceRow = {
  id: string;
  sequence_number: number;
  trigger_type: string;
  status: string;
  scheduled_for: string | null;
  push_sent: number;
  push_device_count: number;
  in_app_sent: number;
  in_app_member_count: number;
  started_at: string | null;
  completed_at: string | null;
};

type DeviceLogRow = {
  userId: string;
  deviceId: string | null;
  channel: string;
  status: string;
  skipReason: string | null;
  sentAt: string | null;
  updatedAt: string | null;
};

type LinkedContent = {
  id: string;
  content_type: string;
  title: string;
  hero_image_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

import type { MessageKey } from "@/lib/i18n/messages";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function sendModeLabel(t: TFn, mode: string | undefined): string {
  if (mode === "scheduled") return t("admin_notif_send_mode_scheduled");
  if (mode === "recurring") return t("admin_notif_send_mode_recurring");
  return t("admin_notif_send_mode_immediate");
}

function readLinkedContentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.appNoticeId === "string") return p.appNoticeId.trim();
  if (typeof p.content_id === "string") return p.content_id.trim();
  return "";
}

export function AdminNotificationCampaignDetailPage() {
  const { t, safeT, language } = useI18n();
  const params = useParams();
  const id = typeof params?.campaignId === "string" ? params.campaignId : "";

  const [camp, setCamp] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [deviceDeliveryLog, setDeviceDeliveryLog] = useState<DeviceLogRow[]>([]);
  const [linkedContent, setLinkedContent] = useState<LinkedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/${id}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaign?: Record<string, unknown>;
        summary?: CampaignSummary | null;
        occurrences?: OccurrenceRow[];
        deviceDeliveryLog?: DeviceLogRow[];
      };
      if (res.ok && j?.ok) {
        setCamp(j.campaign ?? null);
        setSummary(j.summary ?? null);
        setOccurrences(Array.isArray(j.occurrences) ? j.occurrences : []);
        setDeviceDeliveryLog(Array.isArray(j.deviceDeliveryLog) ? j.deviceDeliveryLog : []);
        setErr(null);
      } else {
        setErr(t("admin_notif_not_found"));
      }
    } finally {
      setLoading(false);
    }
    // `t` omitted on purpose: i18n boot recreates `t` and was re-triggering refresh → prolonged "불러오는 중…".
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const contentId = readLinkedContentId(camp?.target_payload);
    if (!contentId) {
      setLinkedContent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/app-notices/${encodeURIComponent(contentId)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notice?: LinkedContent;
        };
        if (cancelled) return;
        if (res.ok && j.ok && j.notice) setLinkedContent(j.notice);
        else setLinkedContent(null);
      } catch {
        if (!cancelled) setLinkedContent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camp?.target_payload]);

  const isSending = summary?.status === "sending" || occurrences.some((o) => o.status === "sending");

  useEffect(() => {
    if (!isSending) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isSending, refresh]);

  const cancelOccurrence = async (occurrenceId: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/notification-campaigns/occurrences/${occurrenceId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : t("admin_notif_err_save"));
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!id) {
    return <p className="p-4 text-sm text-sam-muted">{t("admin_notif_err_invalid_route")}</p>;
  }

  const linkedId = readLinkedContentId(camp?.target_payload);
  const linkedType = linkedContent
    ? parseCustomerCenterContentType(linkedContent.content_type, "notice")
    : null;
  const boardLabel =
    linkedType != null ? BOARD_LABEL[linkedType][language === "en" ? "en" : "ko"] : "";
  const pushImage =
    typeof camp?.push_image_url === "string" && camp.push_image_url.trim()
      ? String(camp.push_image_url).trim()
      : "";
  const inAppImage =
    typeof camp?.in_app_image_url === "string" && camp.in_app_image_url.trim()
      ? String(camp.in_app_image_url).trim()
      : "";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Link href="/admin/notifications" className="text-sm text-signature hover:underline">
        ← {t("admin_back_to_list")}
      </Link>

      {loading && !camp ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : camp ? (
        <>
          {/* 1. Linked content */}
          <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_notif_section_linked_content", {
                fallbackKo: "연결 원본",
                fallbackEn: "Linked original",
              })}
            </h2>
            {linkedId && linkedContent ? (
              <div className="space-y-2 rounded-ui-rect border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-start gap-3">
                  {linkedContent.hero_image_url ? (
                    <SamarketThumbnail
                      src={String(linkedContent.hero_image_url)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-ui-rect object-cover"
                      size={56}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="inline-block rounded-ui-rect bg-sam-app px-1.5 py-0.5 text-[11px] font-medium text-sam-muted">
                      {boardLabel}
                    </span>
                    <p className="break-words text-sm font-semibold text-sam-fg">{linkedContent.title}</p>
                    <p className="font-mono text-[11px] text-sam-meta">
                      {safeT("admin_notif_content_id_label", {
                        fallbackKo: "콘텐츠 ID",
                        fallbackEn: "Content ID",
                      })}
                      : {linkedContent.id}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/admin/app/notices/${encodeURIComponent(linkedContent.id)}`}
                  className="inline-block rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-signature"
                >
                  {safeT("admin_notif_btn_view_original", {
                    fallbackKo: "원본 보기",
                    fallbackEn: "View original",
                  })}
                </Link>
              </div>
            ) : (
              <p className="rounded-ui-rect border border-dashed border-sam-border bg-sam-muted/10 px-3 py-2 text-sm text-sam-fg">
                {safeT("admin_notif_pure_transport_box", {
                  fallbackKo: "[단순 알림] 연결된 게시물이 없습니다.",
                  fallbackEn: "[Pure transport] No linked post.",
                })}
              </p>
            )}
          </section>

          {/* 2. Delivery copy + images */}
          <header className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-sam-muted">
                  {safeT("admin_notif_label_title", {
                    fallbackKo: "알림 제목",
                    fallbackEn: "Notification title",
                  })}
                </p>
                <h1 className="text-lg font-semibold text-sam-fg">{String(camp.title ?? "")}</h1>
              </div>
              <span className="rounded-ui-rect bg-sam-app px-2 py-1 text-xs text-sam-muted">
                {notifStatusLabel(t, String(camp.status ?? ""))}
              </span>
            </div>
            <div>
              <p className="text-xs text-sam-muted">
                {safeT("admin_notif_label_body", {
                  fallbackKo: "알림 메시지",
                  fallbackEn: "Notification message",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-sam-fg">{String(camp.body ?? "")}</p>
            </div>
            {(pushImage || inAppImage) && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-sam-muted">
                  {safeT("admin_notif_detail_delivery_images", {
                    fallbackKo: "알림 이미지",
                    fallbackEn: "Delivery images",
                  })}
                </p>
                <div className="flex flex-wrap gap-4">
                  {pushImage ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-sam-muted">{t("admin_notif_label_push_image")}</p>
                      <SamarketThumbnail
                        src={pushImage}
                        alt=""
                        className="h-16 w-16 rounded-ui-rect object-cover"
                        size={64}
                      />
                    </div>
                  ) : null}
                  {inAppImage ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-sam-muted">{t("admin_notif_label_in_app_image")}</p>
                      <SamarketThumbnail
                        src={inAppImage}
                        alt=""
                        className="h-16 w-16 rounded-ui-rect object-cover"
                        size={64}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </header>

          {/* 3. Policy fields */}
          <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {safeT("admin_notif_section_send_policy", {
                fallbackKo: "발송 정책",
                fallbackEn: "Send policy",
              })}
            </h2>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_type")}</span>{" "}
                {notifTypeLabel(t, String(camp.type ?? ""))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_channel")}</span>{" "}
                {notifChannelLabel(t, String(camp.channel ?? "push_and_in_app"))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_target")}</span>{" "}
                {notifTargetLabel(t, String(camp.target_type ?? ""))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_label_send_mode")}</span>{" "}
                {sendModeLabel(t, String(camp.send_mode ?? "immediate"))}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_detail_created_at")}</span>{" "}
                {String(camp.created_at ?? "—")}
              </p>
              <p>
                <span className="text-sam-muted">{t("admin_notif_detail_scheduled_at")}</span>{" "}
                {String(camp.scheduled_at ?? "—")}
              </p>
            </div>
            {camp.deeplink_url || camp.web_url ? (
              <p className="break-all text-xs text-signature">
                {camp.deeplink_url ? String(camp.deeplink_url) : null}
                {camp.deeplink_url && camp.web_url ? " · " : null}
                {camp.web_url ? String(camp.web_url) : null}
              </p>
            ) : null}
          </section>

          {err ? <p className="text-sm text-red-600">{err}</p> : null}

          {isSending ? (
            <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-sam-fg">{t("admin_notif_status_sending")}</p>
              <p className="mt-1 text-sam-muted">{t("admin_notif_sending_progress")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs"
              >
                {t("admin_notif_btn_search")}
              </button>
            </div>
          ) : null}

          {/* 4. Occurrence + summary */}
          {summary ? (
            <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_section_summary")}</h2>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  {t("admin_notif_summary_push", {
                    sent: summary.push_sent ?? 0,
                    devices: summary.push_device_count ?? 0,
                    failed: summary.push_failed ?? 0,
                    skipped: summary.push_skipped ?? 0,
                  })}
                </p>
                <p className="rounded-ui-rect bg-sam-app px-3 py-2">
                  {t("admin_notif_summary_in_app", {
                    sent: summary.in_app_sent ?? 0,
                    members: summary.in_app_member_count ?? 0,
                    failed: summary.in_app_failed ?? 0,
                    skipped: summary.in_app_skipped ?? 0,
                  })}
                </p>
              </div>
              <p className="text-xs text-sam-muted">
                {t("admin_notif_detail_target_count")}: {summary.target_member_count ?? 0} ·{" "}
                {t("admin_notif_audience_push_users", { count: summary.push_eligible_member_count ?? 0 })}
              </p>
            </section>
          ) : null}

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">{t("admin_notif_section_occurrences")}</h2>
            {occurrences.length === 0 ? (
              <p className="mt-2 text-xs text-sam-muted">{t("admin_notif_detail_no_delivery_log")}</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-sam-muted">
                    <tr>
                      <th className="py-1 pr-3">{t("admin_occurrence_th_sequence")}</th>
                      <th className="py-1 pr-3">{t("admin_occurrence_th_trigger")}</th>
                      <th className="py-1 pr-3">{t("admin_notif_label_status")}</th>
                      <th className="py-1 pr-3">{t("admin_notif_detail_scheduled_at")}</th>
                      <th className="py-1 pr-3">{t("admin_notif_th_result")}</th>
                      <th className="py-1">{t("admin_points_th_work")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occurrences.map((row) => (
                      <tr key={row.id} className="border-t border-sam-border-soft">
                        <td className="py-1 pr-3 tabular-nums">{row.sequence_number}</td>
                        <td className="py-1 pr-3">{row.trigger_type}</td>
                        <td className="py-1 pr-3">
                          {row.status === "queued"
                            ? t("admin_notif_status_queued")
                            : notifStatusLabel(t, row.status)}
                        </td>
                        <td className="py-1 pr-3">{row.scheduled_for?.slice(0, 16) ?? "—"}</td>
                        <td className="py-1 pr-3">
                          {t("admin_notif_result_metrics", {
                            pushSent: row.push_sent ?? 0,
                            pushTotal: row.push_device_count ?? 0,
                            inAppSent: row.in_app_sent ?? 0,
                            inAppTotal: row.in_app_member_count ?? 0,
                          })}
                        </td>
                        <td className="py-1">
                          {row.status === "queued" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void cancelOccurrence(row.id)}
                              className="rounded-ui-rect border border-red-300 px-2 py-0.5 text-[11px] text-red-700 disabled:opacity-40"
                            >
                              {t("admin_notif_btn_cancel_occurrence")}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 5. Device log */}
          <details className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <summary className="cursor-pointer text-sm font-medium text-sam-fg">
              {t("admin_notif_detail_delivery_log")} (device)
            </summary>
            {deviceDeliveryLog.length === 0 ? (
              <p className="mt-2 text-xs text-sam-muted">{t("admin_notif_detail_no_delivery_log")}</p>
            ) : (
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-sam-muted">
                    <tr>
                      <th className="py-1 pr-3">userId</th>
                      <th className="py-1 pr-3">channel</th>
                      <th className="py-1 pr-3">{t("admin_notif_label_status")}</th>
                      <th className="py-1">time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceDeliveryLog.map((row, idx) => (
                      <tr key={`${row.userId}-${row.channel}-${idx}`} className="border-t border-sam-border-soft">
                        <td className="py-1 pr-3 font-mono">{row.userId.slice(0, 8)}…</td>
                        <td className="py-1 pr-3">{row.channel}</td>
                        <td className="py-1 pr-3">{row.status}</td>
                        <td className="py-1">{row.sentAt ?? row.updatedAt ?? row.skipReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        </>
      ) : (
        <p className="text-sm text-sam-muted">{t("admin_notif_not_found")}</p>
      )}
    </div>
  );
}
