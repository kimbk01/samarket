"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformEventRow } from "@/lib/platform-events/types";
import { resolvePlatformEventAvailability } from "@/lib/platform-events/publication";

export function AdminPlatformEventsListClient() {
  const { safeT, language } = useI18n();
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {safeT("admin_platform_events_title", {
            fallbackKo: "이벤트",
            fallbackEn: "Events",
          })}
        </h1>
        <Link
          href="/admin/platform-events/new"
          className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
        >
          {safeT("admin_platform_events_create", {
            fallbackKo: "새 이벤트",
            fallbackEn: "New event",
          })}
        </Link>
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
            const avail = resolvePlatformEventAvailability(ev);
            return (
              <li key={ev.id}>
                <Link
                  href={`/admin/platform-events/${encodeURIComponent(ev.id)}`}
                  className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-sam-fg/5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{ev.title}</div>
                    <div className="mt-0.5 text-xs text-sam-muted">
                      {ev.status} · {avail}
                      {ev.updatedAt
                        ? ` · ${new Date(ev.updatedAt).toLocaleString(
                            language === "en" ? "en-PH" : "ko-KR"
                          )}`
                        : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--sam-brand,#085c3f)]">Edit</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
