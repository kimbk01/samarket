"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export function NoticeDetailContent({ noticeId }: { noticeId: string }) {
  const { t, language } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = noticeId.trim();
    if (!id) {
      setError(t("settings_notices_load_failed"));
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await runSingleFlight(`me:settings:notices:detail:${id}`, () =>
          fetch(`/api/me/settings/notices/${encodeURIComponent(id)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          notice?: { title?: string; body?: string; createdAt?: string };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.notice) {
          setError(typeof json.error === "string" ? json.error : t("settings_notices_load_failed"));
          return;
        }
        setTitle(String(json.notice.title ?? ""));
        setBody(String(json.notice.body ?? ""));
        setCreatedAt(String(json.notice.createdAt ?? ""));
      } catch {
        if (!cancelled) setError(t("settings_notices_load_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noticeId, t]);

  if (loading) {
    return <div className="py-12 text-center sam-text-body text-sam-muted">{t("settings_notices_loading")}</div>;
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="sam-text-body text-red-600">{error}</p>
        <Link href="/mypage/section/settings/notices" className="text-signature underline">
          {t("settings_notices")}
        </Link>
      </div>
    );
  }

  const dateLabel = (() => {
    const value = new Date(createdAt);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  })();

  return (
    <article className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <Link href="/mypage/section/settings/notices" className="sam-text-helper text-signature underline">
        {t("settings_notices")}
      </Link>
      <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
      {dateLabel ? <p className="text-xs text-sam-meta">{dateLabel}</p> : null}
      <p className="whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">{body}</p>
    </article>
  );
}
