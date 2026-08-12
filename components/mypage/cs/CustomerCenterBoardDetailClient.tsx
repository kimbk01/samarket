"use client";

import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CustomerCenterCommentsPanel } from "@/components/mypage/cs/CustomerCenterCommentsPanel";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  BOARD_LABEL,
  customerCenterContentUnavailableFallback,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_READING_COLUMN_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";

type DetailNotice = {
  id: string;
  contentType?: CustomerCenterContentType;
  title: string;
  body: string;
  heroImageUrl?: string | null;
  authorLabel?: string;
  viewCount?: number;
  commentEnabled?: boolean;
  createdAt: string;
};

export function CustomerCenterBoardDetailClient({
  contentType,
  contentId,
}: {
  contentType: CustomerCenterContentType;
  contentId: string;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <Inner contentType={contentType} contentId={contentId} />
    </Suspense>
  );
}

function Inner({
  contentType,
  contentId,
}: {
  contentType: CustomerCenterContentType;
  contentId: string;
}) {
  const { safeT, language } = useI18n();
  const boardLabel = BOARD_LABEL[contentType][language === "en" ? "en" : "ko"];
  const backHref = buildCustomerCenterBoardListPath(contentType);
  const [notice, setNotice] = useState<DetailNotice | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = contentId.trim();
    if (!id) {
      setError(
        safeT("settings_notices_load_failed", {
          fallbackKo: "글을 불러오지 못했습니다",
          fallbackEn: "Could not load this post",
        })
      );
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await runSingleFlight(`me:cc:detail:${id}`, () =>
          fetch(`/api/me/settings/notices/${encodeURIComponent(id)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          unavailable?: boolean;
          message?: string;
          notice?: DetailNotice;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.notice) {
          setError(
            typeof json.error === "string"
              ? json.error
              : safeT("settings_notices_load_failed", {
                  fallbackKo: "글을 불러오지 못했습니다",
                  fallbackEn: "Could not load this post",
                })
          );
          return;
        }
        setUnavailable(json.unavailable === true);
        setNotice(json.notice);
        setViewCount(
          typeof json.notice.viewCount === "number" ? json.notice.viewCount : null
        );
        if (json.unavailable !== true) {
          void fetch(`/api/me/settings/notices/${encodeURIComponent(id)}/view`, {
            method: "POST",
            credentials: "include",
          })
            .then((r) => r.json().catch(() => ({})))
            .then((v: { viewCount?: number }) => {
              if (!cancelled && typeof v.viewCount === "number") setViewCount(v.viewCount);
            })
            .catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setError(
            safeT("settings_notices_load_failed", {
              fallbackKo: "글을 불러오지 못했습니다",
              fallbackEn: "Could not load this post",
            })
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentId, safeT]);

  const dateLabel = (() => {
    if (!notice?.createdAt) return "";
    const value = new Date(notice.createdAt);
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US");
  })();

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS} data-testid={`cc-detail-${contentType}`}>
      <MySubpageHeader title={boardLabel} backHref={backHref} preferHistoryBack={false} hideCtaStrip />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={CUSTOMER_CENTER_READING_COLUMN_CLASS}>
          {loading ? (
            <p className="py-12 text-center text-sam-muted">
              {safeT("settings_notices_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
            </p>
          ) : error ? (
            <p className="py-12 text-center text-red-600">{error}</p>
          ) : notice ? (
            <article className="space-y-4">
              <header className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">{boardLabel}</p>
                <h1 className="text-xl font-semibold text-sam-fg break-words">{notice.title}</h1>
                <p className="text-xs text-sam-meta">
                  {[
                    notice.authorLabel,
                    dateLabel,
                    typeof (viewCount ?? notice.viewCount) === "number"
                      ? `조회 ${viewCount ?? notice.viewCount}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </header>
              {notice.heroImageUrl && !unavailable ? (
                <div className="relative aspect-[16/9] w-full overflow-hidden rounded-ui-rect border border-sam-border">
                  <SamarketThumbnail
                    src={notice.heroImageUrl}
                    alt=""
                    fill
                    fetchDisplayPx={800}
                    className="h-full w-full"
                    imageClassName="object-cover"
                    roundedClassName="rounded-ui-rect"
                  />
                </div>
              ) : null}
              {unavailable ? (
                <div className="whitespace-pre-wrap break-words sam-text-body text-sam-fg">
                  {language === "en"
                    ? customerCenterContentUnavailableFallback("en")
                    : customerCenterContentUnavailableFallback("ko")}
                </div>
              ) : (
                <CustomerCenterSafeMarkdownBody body={notice.body} />
              )}
              {!unavailable && notice.commentEnabled !== false ? (
                <CustomerCenterCommentsPanel contentId={notice.id} enabled />
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
