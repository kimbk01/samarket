"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { CustomerCenterContentMedia } from "@/components/notices/CustomerCenterContentMedia";
import { CustomerCenterCommentsPanel } from "@/components/mypage/cs/CustomerCenterCommentsPanel";
import {
  customerCenterBoardCacheKey,
  type CustomerCenterBoardListItem,
} from "@/components/mypage/cs/CustomerCenterBoardListClient";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  fetchMypageListJson,
  MypageListHttpError,
  readMypageListCache,
} from "@/lib/mypage/use-mypage-cursor-list";
import {
  BOARD_LABEL,
  customerCenterContentUnavailableFallback,
  parseCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { resolveNotificationAwareDetailBackHref } from "@/lib/notifications/notification-entry-from";
import { CC_BODY_CLASS, CC_CATEGORY_CHIP_CLASS, CC_NOTE_CLASS, CC_TITLE_CLASS } from "@/lib/mypage/customer-center-ui";
import { Sam } from "@/lib/ui/sam-component-classes";

type DetailNotice = {
  id: string;
  contentType?: CustomerCenterContentType;
  title: string;
  body: string;
  heroImageUrl?: string | null;
  authorLabel?: string;
  viewCount?: number;
  commentCount?: number;
  commentEnabled?: boolean;
  createdAt: string;
};

type DetailJson = { ok?: boolean; unavailable?: boolean; notice?: DetailNotice };

const CONTENT_TYPES: readonly CustomerCenterContentType[] = ["notice", "system", "marketing"];

/** 목록 캐시 peek — 넘겨받은 제목·날짜로 첫 화면 즉시(S62 성능) */
export function peekCustomerCenterBoardListItem(
  contentId: string,
  contentType?: CustomerCenterContentType
): CustomerCenterBoardListItem | null {
  const types = contentType ? [contentType] : CONTENT_TYPES;
  for (const type of types) {
    const hit = readMypageListCache<CustomerCenterBoardListItem>(customerCenterBoardCacheKey(type, null));
    const item = hit?.items.find((x) => x.id === contentId);
    if (item) return { ...item, contentType: item.contentType ?? type };
  }
  return null;
}

/** 상세 로딩 스켈레톤 — 제목 2줄 · 메타 1줄 · 본문 6줄 (S62) */
function DetailSkeleton({ peek }: { peek: CustomerCenterBoardListItem | null }) {
  const bone = "block rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div
      aria-busy="true"
      data-testid="my-state-loading"
      data-template="detail"
      className="space-y-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-5 md:px-5"
    >
      {peek ? (
        <header className="space-y-2">
          <h1 className={`${CC_TITLE_CLASS} break-words`}>{peek.title}</h1>
          <p className={CC_NOTE_CLASS}>{formatMypageDate(peek.createdAt)}</p>
        </header>
      ) : (
        <div className="space-y-2">
          <span className={`${bone} h-5 w-[85%]`} />
          <span className={`${bone} h-5 w-[55%]`} />
          <span className={`${bone} h-3 w-[40%]`} />
        </div>
      )}
      <div className="space-y-2 pt-2">
        {[92, 100, 88, 96, 70, 50].map((w, i) => (
          <span key={i} className={`${bone} h-3.5`} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * 고객센터 게시글 상세 (최종 설계 S62).
 * `contentType` 생략 = 벨 딥링크 `/mypage/notices/{id}`(X15/K11) — 경로는 그대로, 응답의 게시판 종류로 렌더.
 */
export function CustomerCenterBoardDetailClient({
  contentType,
  contentId,
}: {
  contentType?: CustomerCenterContentType;
  contentId: string;
}) {
  return (
    <Suspense fallback={<DetailSkeleton peek={null} />}>
      <Inner contentType={contentType} contentId={contentId} />
    </Suspense>
  );
}

function Inner({ contentType, contentId }: { contentType?: CustomerCenterContentType; contentId: string }) {
  const { t, safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const id = contentId.trim();
  const peek = useMemo(() => (id ? peekCustomerCenterBoardListItem(id, contentType) : null), [id, contentType]);
  const [notice, setNotice] = useState<DetailNotice | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found" | "error">(id ? "loading" : "not_found");
  const [reloadKey, setReloadKey] = useState(0);
  const [viewCount, setViewCount] = useState<number | null>(null);

  const resolvedType: CustomerCenterContentType =
    contentType ?? parseCustomerCenterContentType(notice?.contentType ?? peek?.contentType, "notice");
  const boardLabel = BOARD_LABEL[resolvedType][lang];
  const listHref = buildCustomerCenterBoardListPath(resolvedType);
  const backHref = resolveNotificationAwareDetailBackHref({ from, fallbackHref: listHref });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const json = await runSingleFlight(`me:cc:detail:${id}`, () =>
          fetchMypageListJson<DetailJson>(`/api/me/settings/notices/${encodeURIComponent(id)}`)
        );
        if (cancelled) return;
        if (!json.ok || !json.notice) {
          setStatus("error");
          return;
        }
        setUnavailable(json.unavailable === true);
        setNotice(json.notice);
        setViewCount(typeof json.notice.viewCount === "number" ? json.notice.viewCount : null);
        setStatus("ready");
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
      } catch (e) {
        if (cancelled) return;
        setStatus(e instanceof MypageListHttpError && e.status === 404 ? "not_found" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  let body: ReactNode;
  if (status === "loading") {
    body = <DetailSkeleton peek={peek} />;
  } else if (status === "not_found") {
    body = (
      <MyStateView
        kind="empty"
        template="detail"
        empty={{
          title: t("mypage_s62_not_found"),
          cta: (
            <Link href={listHref} className={`${Sam.btn.secondaryCombo} ${Sam.focusRing}`} data-testid="cc-detail-to-list">
              {t("mypage_s62_back_to_list")}
            </Link>
          ),
        }}
      />
    );
  } else if (status === "error" || !notice) {
    body = (
      <MyStateView
        kind="error"
        template="detail"
        error={{
          message: safeT("settings_notices_load_failed", {
            fallbackKo: "글을 불러오지 못했습니다",
            fallbackEn: "Could not load this post",
          }),
          onRetry: () => setReloadKey((k) => k + 1),
        }}
      />
    );
  } else {
    const views = viewCount ?? notice.viewCount;
    body = (
      <article className="space-y-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-5 md:px-5">
        <header className="space-y-2">
          <span className={CC_CATEGORY_CHIP_CLASS}>{boardLabel}</span>
          <h1 className={`${CC_TITLE_CLASS} break-words`}>{notice.title}</h1>
          <p className={CC_NOTE_CLASS} data-testid="cc-detail-meta">
            {[
              notice.authorLabel,
              formatMypageDate(notice.createdAt),
              typeof views === "number"
                ? safeT("cc_detail_views", {
                    fallbackKo: `조회 ${views}`,
                    fallbackEn: `Views ${views}`,
                    vars: { count: views },
                  })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>
        {!unavailable ? (
          <CustomerCenterContentMedia src={normalizeCustomerCenterHeroImageUrl(notice.heroImageUrl)} alt="" />
        ) : null}
        {unavailable ? (
          <div className={`break-words ${CC_BODY_CLASS}`}>{customerCenterContentUnavailableFallback(lang)}</div>
        ) : (
          <CustomerCenterSafeMarkdownBody body={notice.body || ""} />
        )}
        {!unavailable && notice.commentEnabled !== false ? (
          <CustomerCenterCommentsPanel
            contentId={notice.id}
            enabled
            initialCount={typeof notice.commentCount === "number" ? notice.commentCount : undefined}
            backHref={backHref}
          />
        ) : null}
      </article>
    );
  }

  return (
    <MyScreen title={boardLabel} backHref={backHref} preferHistoryBack={false} template="detail">
      <div className="pb-6" data-testid={`cc-detail-${resolvedType}`}>
        {body}
      </div>
    </MyScreen>
  );
}
