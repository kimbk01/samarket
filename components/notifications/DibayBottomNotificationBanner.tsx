"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallStore } from "@/lib/community-messenger/stores/useCallStore";
import { postNotificationEventOpenedRead } from "@/lib/notifications/client/notification-event-read-client";
import type { MessengerCallStatus } from "@/lib/community-messenger/stores/useCallStore";

type BannerFeedRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  routeUrl: string;
  createdAt: string;
};

const POLL_MS = 15000;
const BANNER_COOLDOWN_MS = 5 * 60 * 1000;
const BANNER_LAST_SHOWN_KEY = "dibay:admin-banner:last-shown-at";

function loadLastShownAtMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BANNER_LAST_SHOWN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function saveLastShownAtMap(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BANNER_LAST_SHOWN_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/storage errors
  }
}

function markBannerShown(id: string, category: string): void {
  const now = Date.now();
  const map = loadLastShownAtMap();
  map[id] = now;
  map[`category:${category}`] = now;
  saveLastShownAtMap(map);
}

function isBannerCoolingDown(id: string, category: string): boolean {
  const now = Date.now();
  const map = loadLastShownAtMap();
  const byId = map[id] ?? 0;
  const byCategory = map[`category:${category}`] ?? 0;
  return now - Math.max(byId, byCategory) < BANNER_COOLDOWN_MS;
}

export function isBottomBannerSuppressedByCallStatus(callStatus: MessengerCallStatus): boolean {
  return (
    callStatus === "incoming" ||
    callStatus === "outgoing" ||
    callStatus === "connecting" ||
    callStatus === "ringing" ||
    callStatus === "active" ||
    callStatus === "minimized"
  );
}

export function DibayBottomNotificationBanner() {
  const router = useRouter();
  const { language } = useI18n();
  const callStatus = useCallStore((s) => s.callStatus);
  const [banner, setBanner] = useState<BannerFeedRow | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Record<string, true>>({});

  const isSuppressedByCall = isBottomBannerSuppressedByCallStatus(callStatus);
  const canPoll = !isSuppressedByCall;

  useEffect(() => {
    if (!canPoll) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/me/notifications/admin-banner-feed", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          banner?: BannerFeedRow | null;
        };
        if (!j.ok || cancelled) return;
        const next = j.banner ?? null;
        if (!next || dismissedIds[next.id] || isBannerCoolingDown(next.id, next.category)) return;
        markBannerShown(next.id, next.category);
        setBanner(next);
      } catch {
        // no-op: polling should be quiet in foreground
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canPoll, dismissedIds]);

  const subtitle = useMemo(() => {
    if (!banner) return "";
    if (banner.category === "admin_marketing_banner") {
      return language === "ko" ? "광고 배너" : "Marketing banner";
    }
    return language === "ko" ? "운영 공지" : "Admin notice";
  }, [banner, language]);

  if (!banner || isSuppressedByCall) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] px-3 pb-[max(0.75rem,var(--safe-bottom))]">
      <div className="pointer-events-auto mx-auto flex max-w-xl items-start gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 shadow-sam-elevated">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            setDismissedIds((prev) => ({ ...prev, [banner.id]: true }));
            setBanner(null);
            void postNotificationEventOpenedRead(banner.id);
            router.push(banner.routeUrl || "/community");
          }}
        >
          <p className="truncate text-[11px] font-semibold tracking-wide text-signature">{subtitle}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-sam-fg">{banner.title || "DIBAY"}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-sam-muted">{banner.body || "-"}</p>
        </button>
        <button
          type="button"
          className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-sam-muted hover:bg-sam-app"
          onClick={() => {
            setDismissedIds((prev) => ({ ...prev, [banner.id]: true }));
            setBanner(null);
            void postNotificationEventOpenedRead(banner.id);
          }}
        >
          {language === "ko" ? "닫기" : "Close"}
        </button>
      </div>
    </div>
  );
}
