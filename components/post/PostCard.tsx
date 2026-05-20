"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { TRADE_FEED_THUMB_BOX_CLASS } from "@/lib/posts/trade-feed-layout-classes";
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
import { sanitizeViewerMediaUrl } from "@/lib/media/sanitize-viewer-media-url";

interface PostCardProps {
  post: PostWithMeta;
  /** 거래 종류 스킨 (일반/부동산/중고차/알바/환전) → 뱃지 표시 */
  skinKey?: string;
  /** 목록에서 배치 조회한 찜 여부 (있으면 깜빡임 방지) */
  isFavorite?: boolean;
  /** 찜 토글 시 상위에서 상태 갱신용 */
  onFavoriteChange?: (postId: string, isFavorite: boolean) => void;
  /** 리스트 점 세개 메뉴 액션 (이 글 숨기기, 신고하기 등) */
  onMenuAction?: (postId: string, action: PostListMenuAction) => void;
  /** 홈 첫 렌더 계측용 첫 카드 */
  isFirstCard?: boolean;
  /** 찜 목록 등 — 카드 하단 보조 액션 */
  footer?: ReactNode;
}

export const PostCard = memo(function PostCard({
  post,
  skinKey,
  isFavorite,
  onFavoriteChange,
  onMenuAction,
  isFirstCard = false,
  footer,
}: PostCardProps) {
  const { t } = useI18n();
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
  });
  const thumbnailUrl = sanitizeViewerMediaUrl(
    post.thumbnail_url ||
      (Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : null)
  );

  const authorDisplay = (post.author_nickname ?? "").trim() || "판매자";
  const metaRecord =
    post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
      ? (post.meta as Record<string, unknown>)
      : undefined;
  const locationLine = resolveTradePostListingLocationLine(metaRecord, post.region, post.city);
  const timeLabel =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at)
      : "";
  const viewCount = typeof post.view_count === "number" ? post.view_count : 0;
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
      recordTradeListImageRequestRangeFromResources(imageRef.current?.currentSrc || thumbnailUrl || null);
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
  }, [isFirstCard, thumbnailUrl]);

  return (
    <div
      className={`flex flex-col ${PHILIFE_FB_CARD_CLASS}`}
    >
      <div className="px-3 pb-0 pt-1 sm:px-4">
        <Link
          href={detailHref}
          prefetch
          onPointerEnter={() => {
            void router.prefetch(detailHref);
          }}
          onFocus={() => {
            void router.prefetch(detailHref);
          }}
          onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
          className="flex min-w-0 items-stretch gap-1.5 sm:gap-2"
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
                src={thumbnailUrl}
                fill
                roundedClassName="rounded-none"
                className="bg-sam-surface-muted"
                fallbackSrc=""
                imageRef={isFirstCard ? imageRef : undefined}
                onImageLoad={() => {
                  if (!isFirstCard) return;
                  recordTradeListImageRequestRangeFromResources(
                    imageRef.current?.currentSrc || thumbnailUrl || null
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
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-sam-meta" aria-hidden>{t("ui_product_gallery_fallback")}</div>
            )}
          </div>
          <div className="flex min-h-full min-w-0 flex-1 flex-col justify-end">
            {listPreview ? (
              <PostListPreviewColumn
                listingPost={post}
                preview={listPreview}
                omitListingBadge
                matchThumbnailHeight
                omitListFooter
                stretchPreviewToThumbnailColumn={false}
                compactSpacing
              />
            ) : null}
              <div className="mt-0 flex min-w-0 flex-col gap-0.5">
              {locationLine || timeLabel ? (
                <p
                  className="min-w-0 truncate text-[12px] font-normal leading-[1.35] text-[#6B7280]"
                  title={[locationLine ?? "", timeLabel].filter(Boolean).join(" · ")}
                >
                  {[locationLine, timeLabel].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <div className="flex min-w-0 items-center justify-between gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  {listKind !== "jobs" ? (
                    <TradeListingStatusBadge post={post} className="shrink-0" />
                  ) : null}
                  <p
                    className="min-w-0 flex-1 truncate text-[12px] font-normal leading-[1.35] text-[#6B7280]"
                    title={[authorDisplay, `조회 ${viewCount}`].join(" · ")}
                  >
                    <span className="font-semibold text-[#1F2430]">{authorDisplay}</span>
                    <> · </>조회 {viewCount}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#6B7280] sm:gap-2">
                  <PostFavoriteButton
                    postId={post.id}
                    authorUserId={post.author_id}
                    favorited={!!isFavorite}
                    onFavoriteChange={
                      onFavoriteChange ? (fav) => onFavoriteChange(post.id, fav) : undefined
                    }
                    iconClassName="h-4 w-4"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen((prev) => (prev ? prev : true));
                    }}
                    className="sam-header-action flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center text-sam-muted"
                    aria-label={t("ui_home_rail_menu_open")}
                  >
                    <span className="text-[18px] leading-none">⋮</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>
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
                    window.alert(data.error ?? "삭제하지 못했습니다.");
                    return;
                  }
                  onMenuAction?.(post.id, "delete_own");
                } catch {
                  window.alert(t("ui_post_delete_network_error"));
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
