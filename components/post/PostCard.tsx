"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { MapPin } from "lucide-react";
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { PostFavoriteButton } from "@/components/favorites/PostFavoriteButton";
import {
  PostListMenuBottomSheet,
  type PostListMenuAction,
} from "@/components/post/PostListMenuBottomSheet";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  buildPostListPreviewModel,
  POST_LIST_META_LINE_CLASS,
  POST_LIST_PRICE_TEXT_CLASS,
  POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS,
  POST_LIST_REAL_ESTATE_PRICE_TOKEN_LABEL_CLASS,
  POST_LIST_TRADE_PRICE_CLASS,
  POST_LIST_TRADE_TITLE_CLASS,
  POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import {
  imageSanitizeViewerMediaUrl,
  loadTradeFeedThumbnailFetchUrl,
} from "@/lib/image";
import {
  TRADE_FEED_META_COLUMN_CLASS,
  TRADE_FEED_META_ROW_CLASS,
  TRADE_FEED_THUMB_BOX_CLASS,
} from "@/lib/posts/trade-feed-layout-classes";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import {
  bumpTradeListProductCardRenderCount,
  recordTradeListImageRequestRangeFromResources,
  recordTradeListMetricOnce,
} from "@/lib/runtime/trade-list-entry-debug";
import {
  isPostListOwnedByViewer,
  isTradePostForOwnerMenu,
  ownerDeleteLockHint,
  ownerDeleteLockedFromPost,
  ownerEditLockHint,
  ownerEditLockedFromPost,
} from "@/lib/posts/post-list-owner-menu";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import { formatTimeAgo } from "@/lib/utils/format";

/** 피드 카드 부동산 금액 토큰 렌더 */
function FeedRealEstatePriceLine({ text }: { text: string }) {
  const src = text.trim();
  if (!src) return null;
  const parts = src.split("|").map((s) => s.trim()).filter(Boolean);
  const tokenRe = /^(보증금|월세|매매)\s+(.+)$/;
  return (
    <>
      {parts.map((part, idx) => {
        const m = part.match(tokenRe);
        if (!m) {
          return (
            <Fragment key={`plain-${idx}`}>
              {idx > 0 ? (
                <span className="mx-1 text-[12px] font-normal text-[#D1D5DB]" aria-hidden>
                  |
                </span>
              ) : null}
              <span className={POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS}>{part}</span>
            </Fragment>
          );
        }
        return (
          <Fragment key={`tok-${idx}`}>
            {idx > 0 ? (
              <span className="mx-1 text-[12px] font-normal text-[#D1D5DB]" aria-hidden>
                |
              </span>
            ) : null}
            <span className="inline-flex items-baseline gap-1">
              <span className={POST_LIST_REAL_ESTATE_PRICE_TOKEN_LABEL_CLASS}>{m[1]}</span>
              <span className={POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS}>{m[2]}</span>
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

interface PostCardProps {
  post: PostWithMeta;
  /** 거래 종류 스킨 (일반/부동산/중고차/알바/환전) → 뱃지 표시 */
  skinKey?: string;
  /** category.slug — list composition profile */
  categorySlug?: string | null;
  /** `category.settings.field_composition` → list resolve (R5) */
  fieldComposition?: unknown | null;
  /** 목록에서 배치 조회한 찜 여부 (있으면 깜빡임 방지) */
  isFavorite?: boolean;
  /** 찜 토글 시 상위에서 상태 갱신용 */
  onFavoriteChange?: (postId: string, isFavorite: boolean) => void;
  /** 리스트 점 세개 메뉴 액션 (이 글 숨기기, 신고하기 등) */
  onMenuAction?: (postId: string, action: PostListMenuAction) => void;
  /** 홈 첫 렌더 계측용 첫 카드 */
  isFirstCard?: boolean;
  /** 목록 상단 — lazy 대신 eager·high fetch priority */
  priorityThumb?: boolean;
  /** 찜 목록 등 — 카드 하단 보조 액션 */
  footer?: ReactNode;
}

export const PostCard = memo(function PostCard({
  post,
  skinKey,
  categorySlug,
  fieldComposition,
  isFavorite,
  onFavoriteChange,
  onMenuAction,
  isFirstCard = false,
  priorityThumb = false,
  footer,
}: PostCardProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const currency = getAppSettings().defaultCurrency || "KRW";
  const viewerId = getCurrentUser()?.id ?? null;
  const detailHref = `/post/${post.id}`;
  const showOwnerTradeActions =
    isTradePostForOwnerMenu(post.type) && isPostListOwnedByViewer(post, viewerId);
  const ownerMenuPost = {
    author_id: post.author_id,
    status: post.status,
    seller_listing_state: post.seller_listing_state,
    meta: post.meta ?? null,
  };
  const ownerEditLocked = ownerEditLockedFromPost(ownerMenuPost);
  const ownerDeleteLocked = ownerDeleteLockedFromPost(ownerMenuPost);
  const listPreview = buildPostListPreviewModel(post as unknown as Record<string, unknown>, {
    currency,
    locale: getAppSettings().defaultLocale || "ko-KR",
    skinKey,
    categorySlug,
    fieldComposition,
  });
  const thumbnailUrl = imageSanitizeViewerMediaUrl(
    post.thumbnail_url ||
      (Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : null)
  );
  const thumbnailFetchUrl = useMemo(() => {
    if (!thumbnailUrl) return null;
    return loadTradeFeedThumbnailFetchUrl(thumbnailUrl) ?? thumbnailUrl;
  }, [thumbnailUrl]);

  const metaRecord =
    post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
      ? (post.meta as Record<string, unknown>)
      : undefined;
  const isPromotedContent = metaRecord?.promotion_projection === "promoted_content";
  const locationLine = resolveTradePostListingLocationLine(
    metaRecord,
    post.region,
    post.city,
    post.trade_lgu_id
  );
  const timeLabel =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at)
      : "";
  const listKind = listPreview?.listKind ?? "trade";
  const hasUsableThumbnail = Boolean(thumbnailUrl) && !thumbnailFailed;
  /** 중고차 삽니다 — 썸네일 미첨부 시 플레이스홀더 대신 빈 칸(레이아웃 폭 유지) */
  const usedCarBuyEmptyThumbSlot =
    listKind === "used-car" && metaRecord?.car_trade === "buy" && !hasUsableThumbnail;

  useEffect(() => {
    bumpTradeListProductCardRenderCount();
  });

  useLayoutEffect(() => {
    if (!isFirstCard) return;
    recordTradeListMetricOnce("trade_list_first_card_render_start_ms");
    recordTradeListMetricOnce("trade_list_first_card_render_end_ms");
  }, [isFirstCard]);

  useEffect(() => {
    setThumbnailFailed(false);
  }, [post.id, thumbnailUrl]);

  useEffect(() => {
    if (!isFirstCard) return;
    const capture = () =>
      recordTradeListImageRequestRangeFromResources(
        imageRef.current?.currentSrc || thumbnailFetchUrl || null
      );
    if (capture()) return;
    let rafId = 0;
    let tries = 0;
    const poll = () => {
      tries += 1;
      if (capture() || tries >= 90) return;
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isFirstCard, thumbnailFetchUrl]);

  return (
    <div className="relative flex min-w-0 flex-col">
      <Link
        href={detailHref}
        prefetch
        onPointerDown={() => {
          void router.prefetch(detailHref);
        }}
        onPointerEnter={() => {
          void router.prefetch(detailHref);
        }}
        onFocus={() => {
          void router.prefetch(detailHref);
        }}
        onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
        className="flex min-w-0 flex-col"
      >
        <div
          className={
            usedCarBuyEmptyThumbSlot
              ? `${TRADE_FEED_THUMB_BOX_CLASS} bg-transparent`
              : TRADE_FEED_THUMB_BOX_CLASS
          }
        >
          {hasUsableThumbnail ? (
            <SamarketThumbnail
              src={thumbnailFetchUrl}
              fill
              roundedClassName="rounded-ui-rect"
              className="pointer-events-none bg-sam-surface-muted"
              fallbackSrc=""
              priority={isFirstCard || priorityThumb}
              bootMetricTrack={isFirstCard || priorityThumb}
              imageRef={isFirstCard ? imageRef : undefined}
              onImageLoad={() => {
                if (!isFirstCard) return;
                recordTradeListImageRequestRangeFromResources(
                  imageRef.current?.currentSrc || thumbnailFetchUrl || null
                );
              }}
              onImageError={() => setThumbnailFailed(true)}
            />
          ) : usedCarBuyEmptyThumbSlot ? (
            <span className="block h-full min-h-0 w-full" aria-hidden />
          ) : listKind === "jobs" ? (
            <div className="flex h-full w-full items-center justify-center bg-sam-warning-soft text-[12px] font-semibold text-sam-warning" aria-hidden>
              JOB
            </div>
          ) : listKind === "exchange" ? (
            <div className="flex h-full w-full items-center justify-center bg-sam-primary-soft text-[12px] font-semibold text-sam-primary" aria-hidden>
              FX
            </div>
          ) : listKind === "rent-car" ? (
            <div className="flex h-full w-full items-center justify-center bg-sam-surface-muted text-[12px] font-semibold text-sam-muted" aria-hidden>
              RENT
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-sam-meta" aria-hidden>{t("ui_product_gallery_fallback")}</div>
          )}
        </div>
        <div className={TRADE_FEED_META_COLUMN_CLASS}>
          <div className={TRADE_FEED_META_ROW_CLASS}>
            {listPreview?.feedPriceKind === "real_estate" && listPreview.feedPrice ? (
              <p
                className={`${stripPostListBlockTopMargin(POST_LIST_TRADE_PRICE_CLASS)} flex w-full min-w-0 flex-wrap items-baseline gap-x-1`}
              >
                <FeedRealEstatePriceLine text={listPreview.feedPrice} />
              </p>
            ) : listPreview?.feedPriceKind === "jobs_pay" && listPreview.feedJobsPay ? (
              <p
                className={`${stripPostListBlockTopMargin(POST_LIST_TRADE_PRICE_CLASS)} flex w-full min-w-0 flex-wrap items-baseline gap-x-1`}
              >
                <span className={`shrink-0 ${POST_LIST_META_LINE_CLASS}`}>
                  {listPreview.feedJobsPay.label}
                </span>
                {listPreview.feedJobsPay.amount ? (
                  <span className={`min-w-0 ${POST_LIST_PRICE_TEXT_CLASS}`}>
                    {listPreview.feedJobsPay.amount}
                  </span>
                ) : null}
              </p>
            ) : listPreview?.feedPrice?.trim() ? (
              <p className={`${stripPostListBlockTopMargin(POST_LIST_TRADE_PRICE_CLASS)} w-full truncate`}>
                {listPreview.feedPrice.trim()}
              </p>
            ) : (
              <p className="w-full" aria-hidden>
                {"\u00A0"}
              </p>
            )}
          </div>
          <div className={TRADE_FEED_META_ROW_CLASS}>
            {listPreview?.feedTitle?.trim() ? (
              <p
                className={`${stripPostListBlockTopMargin(POST_LIST_TRADE_TITLE_CLASS)} w-full`}
                title={listPreview.feedTitle.trim()}
              >
                {listPreview.feedTitle.trim()}
              </p>
            ) : (
              <p className="w-full" aria-hidden>
                {"\u00A0"}
              </p>
            )}
          </div>
          {listPreview?.listingChips.length || listPreview?.listingRowBoldText?.trim() ? (
            <div className={`${TRADE_FEED_META_ROW_CLASS} flex-wrap gap-1`}>
              {isPromotedContent ? (
                <span className="inline-block shrink-0 rounded bg-sam-app px-1 py-0.5 text-[10px] font-medium text-sam-muted">
                  {safeT("trade_promo_badge", {
                    fallbackKo: "홍보",
                    fallbackEn: "Promoted",
                  })}
                </span>
              ) : null}
              {listPreview?.listingChips.map((c, i) => (
                <span key={`${c.text}-${i}`} className={`${c.className} shrink-0`}>
                  {c.text}
                </span>
              ))}
              {listPreview?.listingRowBoldText?.trim() ? (
                <span className={`${POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS} shrink-0 truncate`}>
                  {listPreview.listingRowBoldText.trim()}
                </span>
              ) : null}
              <TradeListingStatusBadge post={post} className="shrink-0" />
            </div>
          ) : (
            <TradeListingStatusBadge post={post} className="shrink-0" />
          )}
          <div className={TRADE_FEED_META_ROW_CLASS}>
            <p
              className="flex min-w-0 w-full items-center gap-1 truncate text-[12px] font-normal leading-snug text-sam-muted"
              title={[locationLine ?? "", timeLabel].filter(Boolean).join(" · ")}
            >
              {locationLine ? (
                <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                  <MapPin className="h-3 w-3 shrink-0 text-sam-muted" strokeWidth={2} aria-hidden />
                  <span className="truncate">{locationLine}</span>
                </span>
              ) : null}
              {locationLine && timeLabel ? <span className="shrink-0" aria-hidden>·</span> : null}
              {timeLabel ? <span className="truncate">{timeLabel}</span> : null}
            </p>
          </div>
        </div>
      </Link>
      <div className="absolute right-1.5 top-1.5 z-10 rounded-full bg-white/85 p-1 shadow-sm">
        <PostFavoriteButton
          postId={post.id}
          authorUserId={post.author_id}
          favorited={!!isFavorite}
          onFavoriteChange={
            onFavoriteChange ? (fav) => onFavoriteChange(post.id, fav) : undefined
          }
          iconClassName="h-5 w-5 drop-shadow-sm"
        />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((prev) => (prev ? prev : true));
        }}
        className="absolute left-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white"
        aria-label={t("ui_home_rail_menu_open")}
      >
        <span className="text-[14px] leading-none">⋮</span>
      </button>
      {footer ? (
        <div className="border-t border-sam-border-soft bg-sam-surface px-3 py-2 sm:px-4">{footer}</div>
      ) : null}
      {menuOpen ? (
        <PostListMenuBottomSheet
          open
          onClose={() => setMenuOpen((prev) => (prev ? false : prev))}
          showOwnerTradeActions={showOwnerTradeActions}
          ownerEditLocked={showOwnerTradeActions && ownerEditLocked}
          ownerDeleteLocked={showOwnerTradeActions && ownerDeleteLocked}
          ownerEditLockHint={ownerEditLockHint(ownerMenuPost)}
          ownerDeleteLockHint={ownerDeleteLockHint(ownerMenuPost)}
          onAction={(action) => {
            if (action === "edit_own") {
              router.push(`/products/${encodeURIComponent(post.id)}/edit`);
              return;
            }
            if (action === "delete_own") {
              void (async () => {
                try {
                  const res = await runSingleFlight(
                    `trade:post:owner-delete:${post.id}`,
                    () =>
                      fetch(`/api/posts/${encodeURIComponent(post.id)}/owner-delete`, {
                        method: "POST",
                        credentials: "include",
                      })
                  );
                  const data = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                  };
                  if (!res.ok || !data.ok) {
                    await dibayAlert({ title: data.error ?? "삭제하지 못했습니다." });
                    return;
                  }
                  onMenuAction?.(post.id, "delete_own");
                } catch {
                  await dibayAlert({ title: t("ui_post_delete_network_error") });
                }
              })();
              return;
            }
            onMenuAction?.(post.id, action);
          }}
        />
      ) : null}
    </div>
  );
});

PostCard.displayName = "PostCard";
