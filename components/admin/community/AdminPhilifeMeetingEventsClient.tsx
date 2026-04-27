"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MEETING_EVENT_TYPES,
  formatMeetingEventDescription,
  isMeetingEventType,
  type MeetingEventTypeSlug,
} from "@/lib/neighborhood/meeting-event-format";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminMeetingEventRow } from "@/lib/neighborhood/types";
import { philifeAppPaths } from "@domain/philife/paths";
import type { AppLanguageCode } from "@/lib/i18n/config";

const MEETING_EVENT_TYPE_KEYS = {
  join_requested: "admin_meeting_event_type_join_requested",
  join_approved: "admin_meeting_event_type_join_approved",
  join_rejected: "admin_meeting_event_type_join_rejected",
  member_joined: "admin_meeting_event_type_member_joined",
  member_left: "admin_meeting_event_type_member_left",
  member_kicked: "admin_meeting_event_type_member_kicked",
  member_banned: "admin_meeting_event_type_member_banned",
  member_unbanned: "admin_meeting_event_type_member_unbanned",
  member_attendance_updated: "admin_meeting_event_type_member_attendance_updated",
  notice_created: "admin_meeting_event_type_notice_created",
  notice_updated: "admin_meeting_event_type_notice_updated",
  notice_deleted: "admin_meeting_event_type_notice_deleted",
  meeting_closed: "admin_meeting_event_type_meeting_closed",
  meeting_reopened: "admin_meeting_event_type_meeting_reopened",
  meeting_ended: "admin_meeting_event_type_meeting_ended",
  meeting_cancelled: "admin_meeting_event_type_meeting_cancelled",
} as const satisfies Record<MeetingEventTypeSlug, MessageKey>;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminPhilifeMeetingEventsClient() {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [meetingId, setMeetingId] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [events, setEvents] = useState<AdminMeetingEventRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const buildQuery = useCallback(
    (nextOffset: number) => {
      const sp = new URLSearchParams();
      sp.set("limit", "50");
      sp.set("offset", String(nextOffset));
      const mid = meetingId.trim();
      if (mid) sp.set("meetingId", mid);
      if (typeFilter) sp.set("type", typeFilter);
      return sp.toString();
    },
    [meetingId, typeFilter]
  );

  const load = useCallback(
    async (opts: { append: boolean }) => {
      setLoading(true);
      setErr("");
      try {
        const nextOffset = opts.append ? offset : 0;
        const qs = buildQuery(nextOffset);
        const res = await fetch(`/api/admin/meeting-events?${qs}`, { cache: "no-store" });
        const j = (await res.json()) as {
          ok?: boolean;
          events?: AdminMeetingEventRow[];
          hasMore?: boolean;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          setErr(typeof j.error === "string" ? j.error : t("admin_meeting_events_fetch_failed"));
          if (!opts.append) setEvents([]);
          return;
        }
        const list = j.events ?? [];
        setEvents((prev) => (opts.append ? [...prev, ...list] : list));
        setHasMore(!!j.hasMore);
        setOffset(nextOffset + list.length);
      } catch (e) {
        setErr((e as Error).message);
        if (!opts.append) setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery, offset, t]
  );

  const onSearch = () => void load({ append: false });

  useEffect(() => {
    void load({ append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadCsv = () => {
    const sp = new URLSearchParams();
    sp.set("format", "csv");
    sp.set("limit", "500");
    sp.set("offset", "0");
    const mid = meetingId.trim();
    if (mid) sp.set("meetingId", mid);
    if (typeFilter) sp.set("type", typeFilter);
    window.location.assign(`/api/admin/meeting-events?${sp.toString()}`);
  };

  const emptyDash = t("admin_users_empty_placeholder");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {t("admin_meeting_events_meeting_id_label")}
          <input
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            placeholder={t("admin_meeting_events_meeting_id_placeholder")}
            className="min-w-[240px] rounded border border-sam-border bg-sam-surface px-2 py-1.5 font-mono sam-text-helper"
          />
        </label>
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {t("admin_meeting_events_type_label")}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-w-[10rem] rounded border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <option value="">{t("admin_report_filter_all")}</option>
            {MEETING_EVENT_TYPES.map((ev) => (
              <option key={ev} value={ev}>
                {t(MEETING_EVENT_TYPE_KEYS[ev])}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={onSearch}
          className="rounded-ui-rect bg-sky-600 px-4 py-2 sam-text-body-secondary font-medium text-white disabled:opacity-50"
        >
          {t("admin_meeting_events_search")}
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
        >
          {t("admin_meeting_events_csv")}
        </button>
      </div>
      {err ? <p className="sam-text-body-secondary text-red-600">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-full text-left sam-text-helper text-sam-fg">
          <thead className="bg-sam-app sam-text-xxs uppercase text-sam-muted">
            <tr>
              <th className="px-2 py-2">{t("admin_meeting_events_col_time")}</th>
              <th className="px-2 py-2">{t("admin_meeting_events_col_meeting")}</th>
              <th className="px-2 py-2">{t("admin_meeting_events_col_type")}</th>
              <th className="px-2 py-2">{t("admin_meeting_events_col_body")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const time =
                e.created_at && !Number.isNaN(Date.parse(e.created_at))
                  ? new Date(e.created_at).toLocaleString(dateLocale)
                  : e.created_at;
              const typeLabel = isMeetingEventType(e.event_type)
                ? t(MEETING_EVENT_TYPE_KEYS[e.event_type])
                : e.event_type;
              const desc = formatMeetingEventDescription(e);
              return (
                <tr key={e.id} className="border-t border-sam-border-soft align-top">
                  <td className="whitespace-nowrap px-2 py-2 sam-text-xxs text-sam-muted">{time}</td>
                  <td className="max-w-[200px] px-2 py-2">
                    <div className="truncate font-medium text-sam-fg" title={e.meeting_title ?? ""}>
                      {e.meeting_title || emptyDash}
                    </div>
                    <div className="font-mono sam-text-xxs text-sam-meta">{e.meeting_id.slice(0, 8)}…</div>
                    <Link
                      href={philifeAppPaths.meeting(e.meeting_id)}
                      className="sam-text-xxs text-sky-700 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("admin_meeting_events_meeting_detail")}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{typeLabel}</td>
                  <td className="max-w-[min(480px,50vw)] px-2 py-2 sam-text-body-secondary">{desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {events.length === 0 && !loading ? (
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_meeting_events_empty")}</p>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load({ append: true })}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2 sam-text-body-secondary disabled:opacity-50"
        >
          {loading ? t("common_loading") : t("admin_meeting_events_load_more")}
        </button>
      ) : null}
    </div>
  );
}
