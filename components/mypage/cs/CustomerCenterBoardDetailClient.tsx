"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { CustomerCenterContentMedia } from "@/components/notices/CustomerCenterContentMedia";
import { CustomerCenterCommentsPanel } from "@/components/mypage/cs/CustomerCenterCommentsPanel";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  BOARD_LABEL,
  customerCenterContentUnavailableFallback,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { resolveNotificationAwareDetailBackHref } from "@/lib/notifications/notification-entry-from";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_READING_COLUMN_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import {
  CC_BODY_CLASS,
  CC_CATEGORY_CHIP_CLASS,
  CC_NOTE_CLASS,
  CC_SURFACE_PAGE_CLASS,
  CC_TITLE_CLASS,
} from "@/lib/mypage/customer-center-ui";

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
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const boardLabel = BOARD_LABEL[contentType][language === "en" ? "en" : "ko"];
  const backHref = resolveNotificationAwareDetailBackHref({
    from,
    fallbackHref: buildCustomerCenterBoardListPath(contentType),
  });
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
    <div
      className={`${CUSTOMER_CENTER_PAGE_SHELL_CLASS} ${CC_SURFACE_PAGE_CLASS}`}
      data-testid={`cc-detail-${contentType}`}
    >
      <MySubpageHeader title={boardLabel} backHref={backHref} preferHistoryBack={false} hideCtaStrip />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_READING_COLUMN_CLASS} pb-6`}>
          {loading ? (
            <p className={`py-12 text-center ${CC_NOTE_CLASS}`}>
              {safeT("settings_notices_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
            </p>
          ) : error ? (
            <p className="py-12 text-center text-red-600">{error}</p>
          ) : notice ? (
            <article className="space-y-4 rounded-2xl border border-[rgba(14,92,58,0.12)] bg-white px-4 py-5 sm:px-5 sm:py-6">
              <header className="space-y-2">
                <span className={CC_CATEGORY_CHIP_CLASS}>{boardLabel}</span>
                <h1 className={`${CC_TITLE_CLASS} break-words`}>{notice.title}</h1>
                <p className={CC_NOTE_CLASS}>
                  {[
                    notice.authorLabel,
                    dateLabel,
                    typeof (viewCount ?? notice.viewCount) === "number"
                      ? safeT("cc_detail_views", {
                          fallbackKo: `조회 ${viewCount ?? notice.viewCount}`,
                          fallbackEn: `Views ${viewCount ?? notice.viewCount}`,
                          vars: { count: viewCount ?? notice.viewCount ?? 0 },
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </header>
              {!unavailable ? (
                <CustomerCenterContentMedia
                  src={normalizeCustomerCenterHeroImageUrl(notice.heroImageUrl)}
                  alt=""
                />
              ) : null}
              {unavailable ? (
                <div className={`break-words ${CC_BODY_CLASS}`}>
                  {language === "en"
                    ? customerCenterContentUnavailableFallback("en")
                    : customerCenterContentUnavailableFallback("ko")}
                </div>
              ) : (
                <CustomerCenterSafeMarkdownBody body={notice.body || ""} />
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
