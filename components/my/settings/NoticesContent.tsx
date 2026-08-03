"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type NoticeItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  source?: "board" | "push";
  notificationId?: string | null;
  campaignType?: "notice" | "system" | null;
  isRead?: boolean;
};

export function NoticesContent() {
  const { t, language } = useI18n();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (iso: string): string => {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight("me:settings:notices:get", () =>
          fetch("/api/me/settings/notices", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: NoticeItem[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(typeof json.error === "string" ? json.error : t("settings_notices_load_failed"));
          setNotices((prev) => (prev.length === 0 ? prev : []));
          return;
        }
        setNotices(Array.isArray(json.notices) ? json.notices : []);
      } catch {
        if (!cancelled) {
          setError(t("settings_notices_load_failed"));
          setNotices((prev) => (prev.length === 0 ? prev : []));
        }
      } finally {
        if (!cancelled) setLoading((prev) => (prev ? false : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return <div className="py-12 text-center sam-text-body text-sam-muted">{t("settings_notices_loading")}</div>;
  }

  if (error) {
    return <div className="py-12 text-center sam-text-body text-red-600">{error}</div>;
  }

  if (notices.length === 0) {
    return (
      <div className="py-12 text-center sam-text-body text-sam-muted">{t("settings_notices_empty")}</div>
    );
  }

  return (
    <ul className="divide-y divide-sam-border-soft">
      {notices.map((n) => {
        const href =
          n.source === "push" && n.notificationId
            ? `/notifications/${encodeURIComponent(n.notificationId)}`
            : null;
        const chip =
          n.campaignType === "system"
            ? t("notif_surface_system")
            : t("notif_surface_notice");
        const inner = (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex shrink-0 rounded-md bg-sam-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-sam-fg">
                {chip}
              </span>
              {n.source === "push" && n.isRead === false ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sam-danger" aria-hidden />
              ) : null}
            </div>
            <p className="mt-1 font-medium text-sam-fg">{n.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-sam-muted">{n.body}</p>
            <p className="mt-1 text-xs text-sam-meta">{formatDate(n.createdAt)}</p>
          </>
        );
        return (
          <li key={n.id} className="py-3">
            {href ? (
              <Link href={href} className="block rounded-ui-rect transition hover:bg-sam-muted/10">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
