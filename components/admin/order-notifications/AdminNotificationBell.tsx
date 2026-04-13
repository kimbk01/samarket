"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";

export function AdminNotificationBell() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notifications?unread_count_only=1", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; unread_count?: number };
      if (res.ok && j?.ok) {
        setCount(Math.max(0, Math.floor(Number(j.unread_count) || 0)));
      } else {
        setCount(0);
      }
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onUpdated = () => void load();
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", onVis);
      window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("visibilitychange", onVis);
        window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onUpdated);
      }
    };
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NOTIFICATION_SYNC_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Link
      href="/admin/order-notifications"
      className="relative inline-flex h-9 items-center gap-1.5 rounded-ui-rect border border-ig-border bg-sam-surface px-2.5 text-[12px] font-medium text-foreground"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      알림
      {count > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
