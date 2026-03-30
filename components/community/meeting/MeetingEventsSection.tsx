"use client";

import { useCallback, useEffect, useState } from "react";
import { philifeMeetingApi } from "@domain/philife/api";
import {
  MEETING_EVENT_TYPE_LABELS,
  MEETING_EVENT_TYPES,
  formatMeetingEventDescription,
} from "@/lib/neighborhood/meeting-event-format";
import type { NeighborhoodMeetingEventDTO } from "@/lib/neighborhood/types";

type Props = {
  meetingId: string;
  initialEvents: NeighborhoodMeetingEventDTO[];
  initialHasMore: boolean;
};

export function MeetingEventsSection({ meetingId, initialEvents, initialHasMore }: Props) {
  const [events, setEvents] = useState<NeighborhoodMeetingEventDTO[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    setHasMore(initialHasMore);
    setFilter("all");
    setError(null);
  }, [meetingId, initialEvents, initialHasMore]);

  const fetchPage = useCallback(
    async (opts: { offset: number; replace: boolean; typeKey: string }) => {
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams();
        sp.set("limit", "15");
        sp.set("offset", String(opts.offset));
        if (opts.typeKey !== "all") sp.set("type", opts.typeKey);
        const res = await fetch(philifeMeetingApi(meetingId).events(sp.toString()), {
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          events?: NeighborhoodMeetingEventDTO[];
          hasMore?: boolean;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          setError(json.error === "forbidden" ? "운영 로그를 볼 권한이 없습니다." : "불러오지 못했습니다.");
          return;
        }
        const next = json.events ?? [];
        setEvents((prev) => (opts.replace ? next : [...prev, ...next]));
        setHasMore(!!json.hasMore);
      } finally {
        setLoading(false);
      }
    },
    [meetingId]
  );

  const onFilterChange = (value: string) => {
    setFilter(value);
    void fetchPage({ offset: 0, replace: true, typeKey: value });
  };

  const onLoadMore = () => {
    if (loading || !hasMore) return;
    void fetchPage({ offset: events.length, replace: false, typeKey: filter });
  };

  return (
    <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[15px] font-semibold text-gray-900">운영 로그</h2>
        <label className="flex items-center gap-2 text-[12px] text-gray-600">
          <span className="shrink-0">유형</span>
          <select
            className="min-w-[8rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-900"
            value={filter}
            disabled={loading}
            onChange={(e) => onFilterChange(e.target.value)}
          >
            <option value="all">전체</option>
            {MEETING_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="mt-2 text-[13px] text-red-600">{error}</p> : null}
      {events.length === 0 && !loading ? (
        <p className="mt-3 text-[13px] text-gray-500">표시할 기록이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((event) => {
            const eventTime =
              event.created_at && !Number.isNaN(Date.parse(event.created_at))
                ? new Date(event.created_at).toLocaleString("ko-KR")
                : "";
            const text = formatMeetingEventDescription(event);
            return (
              <li key={event.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-[13px] text-gray-900">{text}</p>
                {eventTime ? <p className="mt-1 text-[11px] text-gray-500">{eventTime}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      {hasMore ? (
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2.5 text-[13px] font-medium text-gray-800 disabled:opacity-50"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? "불러오는 중…" : "더보기"}
        </button>
      ) : null}
    </section>
  );
}
