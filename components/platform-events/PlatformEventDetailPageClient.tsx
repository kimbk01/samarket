"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppEmptyState } from "@/components/app-shell/AppEmptyState";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import type { PlatformEventRow } from "@/lib/platform-events/types";
import type { PlatformEventAvailability } from "@/lib/platform-events/publication";

export function PlatformEventDetailPageClient({ eventId }: { eventId: string }) {
  const { safeT, language } = useI18n();
  const [event, setEvent] = useState<PlatformEventRow | null>(null);
  const [availability, setAvailability] = useState<PlatformEventAvailability | null>(null);
  const [fallback, setFallback] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = eventId.trim();
    if (!id) {
      setAvailability("missing");
      setFallback({
        title: language === "en" ? "Not found" : "찾을 수 없음",
        body: language === "en" ? "We could not find this event." : "이벤트를 찾을 수 없습니다.",
      });
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/platform-events/${encodeURIComponent(id)}?lang=${language === "en" ? "en" : "ko"}`,
          { credentials: "same-origin" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          event?: PlatformEventRow;
          availability?: PlatformEventAvailability;
          ended?: boolean;
          fallback?: { title: string; body: string };
        };
        if (cancelled) return;
        if (json.ok && json.event) {
          // EVT-02: ended events are viewable (band + disabled CTA), never 410.
          const isEnded = json.ended === true || json.availability === "ended";
          setEvent(json.event);
          setEnded(isEnded);
          setAvailability(isEnded ? "ended" : "active");
          setFallback(null);
        } else {
          setEvent(null);
          setAvailability(json.availability ?? "missing");
          setFallback(json.fallback ?? null);
        }
      } catch {
        if (!cancelled) {
          setAvailability("missing");
          setFallback({
            title: language === "en" ? "Not found" : "찾을 수 없음",
            body:
              language === "en"
                ? "We could not load this event."
                : "이벤트를 불러오지 못했습니다.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, language]);

  return (
    <div className="min-h-dvh bg-sam-app text-sam-fg" data-platform-event-page="1">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-sam-border bg-sam-app/95 px-2 backdrop-blur">
        <AppBackButton
          preferHistoryBack
          backHref="/events"
          ariaLabel={safeT("nav_back", { fallbackKo: "뒤로가기", fallbackEn: "Go back" })}
        />
        <h1 className="truncate text-[15px] font-semibold">
          {safeT("platform_event_detail_header", {
            fallbackKo: "이벤트",
            fallbackEn: "Event",
          })}
        </h1>
      </header>

      {loading ? (
        <p className="px-4 py-8 text-sm text-sam-muted">
          {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : event && (availability === "active" || availability === "ended") ? (
        <PlatformEventDetailContent
          event={event}
          ended={ended}
          language={language === "en" ? "en" : "ko"}
        />
      ) : (
        <div className="mx-auto max-w-[720px] px-4 py-10" data-platform-event-unavailable={availability ?? "missing"}>
          <AppEmptyState
            title={fallback?.title}
            description={fallback?.body}
            action={
              <Link href="/events" className="text-sm font-semibold text-sam-primary underline">
                {safeT("platform_event_go_board", {
                  fallbackKo: "이벤트 목록으로",
                  fallbackEn: "Back to events",
                })}
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
