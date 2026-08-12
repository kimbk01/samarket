"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveNoticeListBackHref, withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  isNotificationEntryFrom,
  withNotificationEntryFrom,
} from "@/lib/notifications/notification-entry-from";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_READING_COLUMN_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";

export function NoticeDetailPageClient({ noticeId }: { noticeId: string }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <NoticeDetailPageInner noticeId={noticeId} />
    </Suspense>
  );
}

function NoticeDetailPageInner({ noticeId }: { noticeId: string }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = resolveNoticeListBackHref(from);
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
          }),
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          notice?: {
            title?: string;
            body?: string;
            createdAt?: string;
            canonicalHref?: string;
          };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.notice) {
          setError(typeof json.error === "string" ? json.error : t("settings_notices_load_failed"));
          return;
        }
        const canonical = json.notice.canonicalHref?.trim();
        if (canonical) {
          router.replace(
            isNotificationEntryFrom(from)
              ? withNotificationEntryFrom(canonical)
              : withCustomerCenterFrom(canonical, from),
          );
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
  }, [noticeId, t, router, from]);

  const dateLabel = (() => {
    const value = new Date(createdAt);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  })();

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={loading ? t("settings_notices") : title || t("settings_notices")}
        backHref={backHref}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_READING_COLUMN_CLASS} py-4`}>
          {loading ? (
            <div className="py-12 text-center sam-text-body text-sam-muted">
              {t("settings_notices_loading")}
            </div>
          ) : error ? (
            <div className="space-y-3">
              <p className="sam-text-body text-red-600">{error}</p>
              <Link href={backHref} className="text-signature underline">
                {t("settings_notices")}
              </Link>
            </div>
          ) : (
            <article className="space-y-3 overflow-x-clip rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-6">
              {dateLabel ? <p className="sam-text-helper text-sam-meta">{dateLabel}</p> : null}
              <h1 className="break-words text-[20px] font-bold leading-snug text-sam-fg">{title}</h1>
              <div className="whitespace-pre-wrap break-words sam-text-body leading-relaxed text-sam-fg">
                {body}
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
