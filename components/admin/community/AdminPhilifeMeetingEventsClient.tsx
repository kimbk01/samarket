"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MEETING_EVENT_TYPE_LABELS,
  MEETING_EVENT_TYPES,
  formatMeetingEventDescription,
  isMeetingEventType,
} from "@/lib/neighborhood/meeting-event-format";
import type { AdminMeetingEventRow } from "@/lib/neighborhood/types";
import { philifeAppPaths } from "@domain/philife/paths";

export function AdminPhilifeMeetingEventsClient() {
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
          setErr(typeof j.error === "string" ? j.error : "불러오기 실패");
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
    [buildQuery, offset]
  );

  const onSearch = () => void load({ append: false });

  useEffect(() => {
    void load({ append: false });
    // 최초 마운트 시에만 전역 최근 로그를 불러옵니다.
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3">
        <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
          모임 ID (UUID)
          <input
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            placeholder="비우면 전체"
            className="min-w-[240px] rounded border border-sam-border bg-sam-surface px-2 py-1.5 font-mono text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
          유형
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-w-[10rem] rounded border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px]"
          >
            <option value="">전체</option>
            {MEETING_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={onSearch}
          className="rounded-ui-rect bg-sky-600 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          조회
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-medium text-sam-fg"
        >
          CSV 내려받기 (최대 500건)
        </button>
      </div>
      {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-full text-left text-[12px] text-sam-fg">
          <thead className="bg-sam-app text-[11px] uppercase text-sam-muted">
            <tr>
              <th className="px-2 py-2">시각</th>
              <th className="px-2 py-2">모임</th>
              <th className="px-2 py-2">유형</th>
              <th className="px-2 py-2">내용</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const time =
                e.created_at && !Number.isNaN(Date.parse(e.created_at))
                  ? new Date(e.created_at).toLocaleString("ko-KR")
                  : e.created_at;
              const typeLabel = isMeetingEventType(e.event_type)
                ? MEETING_EVENT_TYPE_LABELS[e.event_type]
                : e.event_type;
              const desc = formatMeetingEventDescription(e);
              return (
                <tr key={e.id} className="border-t border-sam-border-soft align-top">
                  <td className="whitespace-nowrap px-2 py-2 text-[11px] text-sam-muted">{time}</td>
                  <td className="max-w-[200px] px-2 py-2">
                    <div className="truncate font-medium text-sam-fg" title={e.meeting_title ?? ""}>
                      {e.meeting_title || "—"}
                    </div>
                    <div className="font-mono text-[10px] text-sam-meta">{e.meeting_id.slice(0, 8)}…</div>
                    <Link
                      href={philifeAppPaths.meeting(e.meeting_id)}
                      className="text-[11px] text-sky-700 underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      모임 상세
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{typeLabel}</td>
                  <td className="max-w-[min(480px,50vw)] px-2 py-2 text-[13px]">{desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {events.length === 0 && !loading ? (
        <p className="text-[13px] text-sam-muted">해당 조건에 맞는 기록이 없습니다.</p>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load({ append: true })}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2 text-[13px] disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더보기"}
        </button>
      ) : null}
    </div>
  );
}
