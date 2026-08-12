"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";

type NoticeItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  canonicalHref?: string;
  source?: "board";
};

/** Phase 2 — board SSOT list only (no Bell/push merge). */
export function NoticesContent() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
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
          }),
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
        const base = n.canonicalHref?.trim() || n.href?.trim() || `/mypage/notices/${encodeURIComponent(n.id)}`;
        const href = withCustomerCenterFrom(base, from);
        return (
          <li key={n.id} className="py-3">
            <Link href={href} className="block min-h-11 rounded-ui-rect transition hover:bg-sam-muted/10">
              <p className="break-words font-medium text-sam-fg">{n.title}</p>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-sam-muted">{n.body}</p>
              <p className="mt-1 text-xs text-sam-meta">{formatDate(n.createdAt)}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
