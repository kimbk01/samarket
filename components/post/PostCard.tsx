"use client";

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
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";
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
  bumpTradeListProductCardRenderCount();
  if (isFirstCard) {
    recordTradeListMetricOnce("trade_list_first_card_render_start_ms");
  }
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
  const thumbnailUrl =
    post.thumbnail_url ||
    (Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : null);
  const isExchangeThumb = listPreview?.thumbnailMode === "exchange";

  useLayoutEffect(() => {
    if (!isFirstCard) return;
    recordTradeListMetricOnce("trade_list_first_card_render_end_ms");
  }, [isFirstCard]);

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
      <div className="relative flex gap-3 sam-card-pad">
        <div
          className="absolute right-[var(--sam-card-padding)] top-[var(--sam-card-padding)] z-[1] flex items-center gap-1"
          onClick={(e) => e.preventDefault()}
          role="presentation"
        >
          <PostFavoriteButton
            postId={post.id}
            authorUserId={post.author_id}
            favorited={!!isFavorite}
            onFavoriteChange={
              onFavoriteChange
                ? (fav) => onFavoriteChange(post.id, fav)
                : undefined
            }
            iconClassName="h-5 w-5"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(true);
            }}
            className="sam-header-action flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center text-sam-muted"
            aria-label="메뉴"
          >
            <span className="text-[18px] leading-none">⋮</span>
          </button>
        </div>
        <Link
          href={detailHref}
          onPointerEnter={() => {
            void router.prefetch(detailHref);
          }}
          onFocus={() => {
            void router.prefetch(detailHref);
          }}
          onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
          className="flex min-w-0 flex-1 gap-3"
        >
          <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-sam-md bg-sam-surface-muted">
            {thumbnailUrl ? (
              <img
                ref={isFirstCard ? imageRef : undefined}
                src={thumbnailUrl}
                alt=""
                width={100}
                height={100}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                onLoad={() => {
                  if (!isFirstCard) return;
                  recordTradeListImageRequestRangeFromResources(
                    imageRef.current?.currentSrc || thumbnailUrl || null
                  );
                }}
              />
            ) : isExchangeThumb ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-sam-primary-soft text-2xl font-semibold text-sam-fg" aria-hidden><span>₱</span><span className="text-[10px] text-sam-muted">↔</span><span>₩</span></div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-sam-meta">이미지</div>
            )}
          </div>
          <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
            {listPreview ? (
              <PostListPreviewColumn
                listingPost={post}
                preview={listPreview}
                matchThumbnailHeight
              />
            ) : null}
          </div>
        </Link>
      </div>
      {footer ? (
        <div className="border-t border-sam-border-soft bg-sam-surface sam-card-pad-x py-3">{footer}</div>
      ) : null}
      {menuOpen ? (
        <PostListMenuBottomSheet
          open
          onClose={() => setMenuOpen(false)}
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
                  const res = await fetch(
                    `/api/posts/${encodeURIComponent(post.id)}/owner-delete`,
                    { method: "POST", credentials: "include" }
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
                  window.alert("네트워크 오류로 삭제하지 못했습니다.");
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
