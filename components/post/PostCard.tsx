"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { MapPin } from "lucide-react";
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PostWithMeta } from "@/lib/posts/schema";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { PostFavoriteButton } from "@/components/favorites/PostFavoriteButton";
import {
  PostListMenuBottomSheet,
  type PostListMenuAction,
} from "@/components/post/PostListMenuBottomSheet";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { TradeNoPhotoPlaceholder } from "@/components/trade/media/TradeNoPhotoPlaceholder";
import { TradeTopicBadge } from "@/components/trade/TradeTopicBadge";
import { useTradeTopicBadge } from "@/lib/trade/topic-badge-store";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import {
  imageSanitizeViewerMediaUrl,
  loadTradeFeedThumbnailFetchUrl,
  prefetchTradePostDetailHeroImage,
} from "@/lib/image";
import {
  TRADE_FEED_THUMB_BOX_CLASS,
  TRADE_FEED_THUMB_SLOT_EMPTY_CLASS,
} from "@/lib/posts/trade-feed-layout-classes";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { handleTradeMarketCardDetailClick } from "@/lib/trade/location/trade-market-card-detail-nav";
import { buildTradeMarketListScrollRouteKey } from "@/lib/trade/location/trade-market-list-scroll-restore";
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
import { resolveTradeCardCityAreaLine } from "@/lib/posts/post-listing-location-label";
import { postHasTradePromotionOverlay } from "@/lib/promotion/trade-promotion-overlay";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { isTradeListingNew, tradeListingAgeLabel } from "@/lib/trade/marketplace/trade-listing-age";
import { useTradeListingNowMs } from "@/lib/trade/marketplace/use-trade-listing-now";
import { useReportedPostIds } from "@/lib/reports/reported-posts-store";
import { hideTradePost, unhideTradePost, useIsTradePostHidden } from "@/lib/trade/hidden-posts-store";
import { ReportedPostCard } from "@/components/post/ReportedPostCard";
import { HiddenPostCard } from "@/components/post/HiddenPostCard";
import {
  TRADE_CARD_AGE_CLASS,
  TRADE_CARD_CHIP_AD_CLASS,
  TRADE_CARD_CHIP_NEW_CLASS,
  TRADE_CARD_LONG_PRESS_MOVE_PX,
  TRADE_CARD_LONG_PRESS_MS,
  TRADE_CARD_META_CLASS,
  TRADE_CARD_PRICE_CLASS,
  TRADE_CARD_PROMOTED_OUTLINE_CLASS,
  TRADE_CARD_ROW1_CLASS,
  TRADE_CARD_ROWS_CLASS,
  TRADE_CARD_TITLE_CLASS,
} from "@/lib/posts/trade-feed-layout-classes";

/** F1: 신고 창은 누를 때만 불러온다 */
const ReportReasonModal = dynamic(
  () => import("@/components/post/ReportReasonModal").then((m) => m.ReportReasonModal),
  { ssr: false }
);

/** v5 1줄(22px) — 부동산 금액 토큰도 가격과 같은 16px/700, 라벨은 작성일과 같은 12px */
const FEED_RE_AMOUNT_CLASS = "shrink-0 text-[16px] font-bold leading-[22px] tabular-nums text-sam-fg";
const FEED_RE_TOKEN_LABEL_CLASS = "shrink-0 text-[12px] font-normal leading-[22px] text-sam-muted";

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
                <span className="mx-1 text-[12px] font-normal text-sam-meta" aria-hidden>
                  |
                </span>
              ) : null}
              <span className={FEED_RE_AMOUNT_CLASS}>{part}</span>
            </Fragment>
          );
        }
        return (
          <Fragment key={`tok-${idx}`}>
            {idx > 0 ? (
              <span className="mx-1 text-[12px] font-normal text-sam-meta" aria-hidden>
                |
              </span>
            ) : null}
            <span className="inline-flex items-baseline gap-1">
              <span className={FEED_RE_TOKEN_LABEL_CLASS}>{m[1]}</span>
              <span className={FEED_RE_AMOUNT_CLASS}>{m[2]}</span>
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
  /** 메뉴 결과 알림 — 숨기기·신고는 카드가 직접 처리하므로 지금은 「삭제」 뒤 목록에서 빼는 용도만 */
  onMenuAction?: (postId: string, action: PostListMenuAction) => void;
  /** 홈 첫 렌더 계측용 첫 카드 */
  isFirstCard?: boolean;
  /** 목록 상단 — lazy 대신 eager·high fetch priority */
  priorityThumb?: boolean;
  /** 찜 목록 등 — 카드 하단 보조 액션 */
  footer?: ReactNode;
  /**
   * 판매완료 카드에서도 하트를 남길지 — 찜 목록에서 판매완료 글을 정리(찜 해제)할 수 있게 하는 용도만.
   * 거래 목록·찾기는 false(판매완료 = 보이기만, 누를 수 없음).
   */
  soldKeepsFavoriteToggle?: boolean;
  /**
   * 샘플 상품(Owner 2026-10-28 「샘플도 실제 게시물 형태」): 실제 카드와 똑같이 그리고, 누르면 상세 대신 샘플 안내.
   * 하트·메뉴 없음, 오른쪽 위 「샘플」 표시.
   */
  showcase?: { onOpen: () => void };
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
  soldKeepsFavoriteToggle = false,
  showcase,
}: PostCardProps) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || "/market";
  const searchParams = useSearchParams();
  const cardRootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** F1 (Owner 2026-11-03): 숨기기·신고는 카드가 직접 처리 — 홈·카테고리·찜·최근 본·전역 검색 어디서나 같은 동작 */
  const [reportOpen, setReportOpen] = useState(false);
  const isReportedByMe = useReportedPostIds().has(post.id);
  const isHiddenByMe = useIsTradePostHidden(post.id);
  /** v5: 점 세 개 대신 카드 길게 누름 → 메뉴. 누른 뒤 손을 떼면 생기는 click 은 상세로 가지 않게 막는다 */
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const nowMs = useTradeListingNowMs();
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
    /** P-6 (L3): 가격 줄 = 사용자 앱 언어 하나로(기기 기본 지역 설정과 섞지 않음) */
    locale: language,
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

  const isPromotedContent = postHasTradePromotionOverlay(post);
  /** P-3 (F3): 그리드 카드 「관심 N」 — 트리거가 유지하는 posts.favorite_count, 일자리 글은 제외 */
  const cardFavoriteCount =
    post.trade_type !== "job" && typeof post.favorite_count === "number" ? Math.max(0, post.favorite_count) : 0;
  const topicBadge = useTradeTopicBadge(post.category_id);
  const statusLower = String(post.status ?? "").toLowerCase();
  /**
   * 볼 수 없는 글(Owner 2026-10-28 승인): 숨김·삭제된 남의 글 — 찜·최근 본 글 등에 남아 있어도 상세(404)로 보내지 않는다.
   * 판매완료처럼 보이기만 하고 누를 수 없다. 글쓴이 본인은 자기 숨김 글을 열 수 있다.
   */
  const isUnavailable =
    !showcase &&
    (statusLower === "hidden" || statusLower === "deleted") &&
    (postAuthorUserId(post as unknown as Record<string, unknown>) || "") !== (viewerId ?? "");
  const isSoldOrClosed = statusLower === "sold" || isUnavailable;
  /** v5: 예약중 = seller_listing_state 'reserved' — 사진 가운데 표시, 누르기는 가능 */
  const isReserved =
    !isSoldOrClosed &&
    normalizeSellerListingState(post.seller_listing_state, post.status) === "reserved";
  /** v5 사진 왼쪽 위 칩 1개: 광고 › NEW (판매완료·예약중·샘플 제외) */
  const topLeftChip: "ad" | "new" | null =
    showcase || isSoldOrClosed || isReserved
      ? null
      : isPromotedContent
        ? "ad"
        : nowMs != null && isTradeListingNew(post.created_at, nowMs)
          ? "new"
          : null;
  /** v5 1줄 오른쪽 작성일 — 마운트 전(서버 그림)·샘플은 비움 */
  const ageLabel = !showcase && nowMs != null ? tradeListingAgeLabel(post.created_at, nowMs, t) : "";
  const menuEnabled = !isSoldOrClosed && !showcase;
  const clearLongPress = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };
  const openMenuFromLongPress = () => {
    suppressNextClickRef.current = true;
    setMenuOpen((prev) => (prev ? prev : true));
  };
  /** P-6: 목록 카드 지역 = 「도시 › 동네」 */
  const locationLine = resolveTradeCardCityAreaLine({
    tradeLguId: post.trade_lgu_id,
    region: post.region,
    city: post.city,
  });
  const hasUsableThumbnail = Boolean(thumbnailUrl) && !thumbnailFailed;

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

  const reportModal = reportOpen ? (
    <ReportReasonModal
      postId={post.id}
      authorUserId={post.author_id ?? null}
      open
      onClose={() => setReportOpen(false)}
    />
  ) : null;

  /** 내가 신고한 글 · 숨긴 글 — 목록 행은 그대로 두고 카드 자리만 가린다(정렬·페이지·광고 위치 불변) */
  if (!showcase && isReportedByMe) {
    return (
      <>
        <ReportedPostCard />
        {reportModal}
      </>
    );
  }
  if (!showcase && isHiddenByMe) {
    return (
      <>
        <HiddenPostCard postId={post.id} onUndo={() => unhideTradePost(post.id)} />
        {reportModal}
      </>
    );
  }

  return (
    <div
      ref={cardRootRef}
      data-market-listing-id={post.id}
      data-market-listing-card="1"
      data-trade-card-promoted={isPromotedContent ? "1" : undefined}
      className={`relative flex min-w-0 flex-col market-listing-card select-none [-webkit-touch-callout:none] ${
        isPromotedContent && !showcase ? TRADE_CARD_PROMOTED_OUTLINE_CLASS : ""
      }`}
      onPointerDown={(e) => {
        if (!menuEnabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        clearLongPress();
        suppressNextClickRef.current = false;
        longPressStartRef.current = { x: e.clientX, y: e.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressStartRef.current = null;
          openMenuFromLongPress();
        }, TRADE_CARD_LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const start = longPressStartRef.current;
        if (!start) return;
        if (
          Math.abs(e.clientX - start.x) > TRADE_CARD_LONG_PRESS_MOVE_PX ||
          Math.abs(e.clientY - start.y) > TRADE_CARD_LONG_PRESS_MOVE_PX
        ) {
          clearLongPress();
        }
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(e) => {
        /** 데스크톱 오른쪽 클릭·안드로이드 길게 누름 기본 메뉴 대신 같은 메뉴 */
        e.preventDefault();
        if (!menuEnabled) return;
        clearLongPress();
        openMenuFromLongPress();
      }}
    >
      <Link
        href={detailHref}
        prefetch={!isSoldOrClosed && !showcase}
        /**
         * 판매완료(Owner 2026-10-28): 거래 목록에서 **보이기만** 하고 누를 수 없다 — 상세·채팅으로 들어가지 않는다.
         * 거래 가격은 카드에 보인다. 기존 채팅방은 채팅 목록에서 이어진다.
         */
        aria-disabled={isSoldOrClosed || undefined}
        tabIndex={isSoldOrClosed ? -1 : undefined}
        onPointerDown={() => {
          if (showcase) return;
          prefetchTradePostDetailHeroImage(thumbnailUrl);
          void router.prefetch(detailHref);
        }}
        onPointerEnter={() => {
          if (showcase) return;
          prefetchTradePostDetailHeroImage(thumbnailUrl);
          void router.prefetch(detailHref);
        }}
        onFocus={() => {
          if (showcase) return;
          void router.prefetch(detailHref);
        }}
        onClick={(e) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            e.preventDefault();
            return;
          }
          if (showcase) {
            e.preventDefault();
            showcase.onOpen();
            return;
          }
          if (isSoldOrClosed) {
            e.preventDefault();
            return;
          }
          beginRouteEntryPerf("product_detail", detailHref);
          const routeKey = buildTradeMarketListScrollRouteKey(
            pathname,
            searchParams?.toString() ?? ""
          );
          handleTradeMarketCardDetailClick({
            event: e,
            postId: post.id,
            detailHref,
            routeKey,
            cardEl: cardRootRef.current,
            router,
            imageUrl: hasUsableThumbnail ? thumbnailFetchUrl || thumbnailUrl || null : null,
            priceText: listPreview?.feedPrice?.trim() || null,
            titleText: listPreview?.feedTitle?.trim() || null,
            locationText: locationLine || null,
          });
        }}
        className={`flex min-w-0 flex-col ${isSoldOrClosed ? "pointer-events-none select-none" : ""}`}
        data-trade-card-disabled={isSoldOrClosed ? "1" : undefined}
      >
        {/* LIST: thumbnail SLOT always present. 사진 없음·불러오기 실패 = 공통 「사진 없음」(P-4). */}
        <div
          data-ui4-slot="photos"
          data-market-thumb-empty={hasUsableThumbnail ? undefined : "1"}
          className={`${hasUsableThumbnail ? TRADE_FEED_THUMB_BOX_CLASS : TRADE_FEED_THUMB_SLOT_EMPTY_CLASS} ${
            isSoldOrClosed ? "[&>*:not([data-trade-card-status])]:opacity-55 [&>*:not([data-trade-card-status])]:grayscale" : ""
          }`}
        >
          {hasUsableThumbnail ? (
            <SamarketThumbnail
              loadingStyle="shimmer"
              retryOriginalOnError
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
          ) : (
            <TradeNoPhotoPlaceholder />
          )}
          {/* v5 사진 왼쪽 위 상태 칩 1개 — 광고(판매자 더 알리기) › NEW(작성 24시간) */}
          {topLeftChip === "ad" ? (
            <span data-trade-card-chip="ad" className={TRADE_CARD_CHIP_AD_CLASS}>
              {safeT("trade_promo_badge", {
                fallbackKo: "광고",
                fallbackEn: "Ad",
              })}
            </span>
          ) : topLeftChip === "new" ? (
            <span data-trade-card-chip="new" className={TRADE_CARD_CHIP_NEW_CLASS}>
              {t("trade_card_new_chip")}
            </span>
          ) : null}
          {/* P-6: 주제 배지(이름 + 색, 아이콘 없음) · 판매완료/마감만 회색으로 강조 */}
          {topicBadge ? (
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[1] max-w-[70%]">
              <TradeTopicBadge
                label={language === "en" && topicBadge.labelEn ? topicBadge.labelEn : topicBadge.label}
                color={topicBadge.color}
              />
            </span>
          ) : null}
          {isSoldOrClosed ? (
            /** 판매완료·마감 — 사진 한가운데, 높이 고정·글자 상하좌우 가운데 */
            <span
              data-trade-card-status="sold"
              className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
            >
              <span className="inline-flex h-7 items-center justify-center rounded-ui-rect bg-black/75 px-3 text-[14px] font-semibold leading-none text-white">
                {isUnavailable
                  ? t("trade_card_status_unavailable")
                  : post.trade_type === "job"
                    ? t("trade_card_status_closed")
                    : t("trade_card_status_sold")}
              </span>
            </span>
          ) : isReserved ? (
            /** v5 예약중 — 판매완료와 같은 자리·모양, 사진 흐림·누름 막기 없음 */
            <span
              data-trade-card-status="reserved"
              className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center"
            >
              <span className="inline-flex h-7 items-center justify-center rounded-ui-rect bg-black/75 px-3 text-[14px] font-semibold leading-none text-white">
                {t("trade_card_status_reserved")}
              </span>
            </span>
          ) : null}
        </div>
        {/* v5 정형 3줄(22·20·18px) — 줄이 늘지 않는다. 1줄 가격+작성일 · 2줄 제목 · 3줄 지역·관심 N */}
        <div className={`${TRADE_CARD_ROWS_CLASS} ${isSoldOrClosed ? "opacity-70" : ""}`} data-market-card-meta="1">
          <div className={TRADE_CARD_ROW1_CLASS}>
            {listPreview?.feedPriceKind === "real_estate" && listPreview.feedPrice ? (
              <p data-ui4-slot="price" className="flex min-w-0 flex-1 items-baseline overflow-hidden whitespace-nowrap">
                <FeedRealEstatePriceLine text={listPreview.feedPrice} />
              </p>
            ) : listPreview?.feedPriceKind === "jobs_pay" && listPreview.feedJobsPay ? (
              <p data-ui4-slot="price" className="flex min-w-0 flex-1 items-baseline gap-x-1 overflow-hidden whitespace-nowrap">
                <span className={FEED_RE_TOKEN_LABEL_CLASS}>{listPreview.feedJobsPay.label}</span>
                {listPreview.feedJobsPay.amount ? (
                  <span className={FEED_RE_AMOUNT_CLASS}>{listPreview.feedJobsPay.amount}</span>
                ) : null}
              </p>
            ) : listPreview?.feedPrice?.trim() ? (
              <p data-ui4-slot="price" className={`${TRADE_CARD_PRICE_CLASS} shrink-0`}>
                {listPreview.feedPrice.trim()}
              </p>
            ) : (
              <p className="min-w-0 flex-1" aria-hidden>
                {"\u00A0"}
              </p>
            )}
            {ageLabel ? (
              <span
                data-ui4-slot="age"
                className={`${TRADE_CARD_AGE_CLASS} ${
                  listPreview?.feedPriceKind === "real_estate" || listPreview?.feedPriceKind === "jobs_pay"
                    ? "shrink-0"
                    : "min-w-0 truncate"
                }`}
              >
                {ageLabel}
              </span>
            ) : null}
          </div>
          {listPreview?.feedTitle?.trim() ? (
            <p data-ui4-slot="title" className={TRADE_CARD_TITLE_CLASS} title={listPreview.feedTitle.trim()}>
              {listPreview.feedTitle.trim()}
            </p>
          ) : (
            <p aria-hidden>{"\u00A0"}</p>
          )}
          {locationLine || cardFavoriteCount > 0 ? (
            <p data-ui4-slot="location" className={TRADE_CARD_META_CLASS} title={locationLine || undefined}>
              <MapPin className="h-3 w-3 shrink-0 text-sam-muted" strokeWidth={2} aria-hidden />
              <span className="min-w-0 truncate">{locationLine}</span>
              {cardFavoriteCount > 0 ? (
                <span className="shrink-0" data-ui4-slot="favorite-count">
                  {locationLine ? "· " : ""}
                  {t("post_preview_fav_count", { count: cardFavoriteCount })}
                </span>
              ) : null}
            </p>
          ) : (
            <p aria-hidden>{"\u00A0"}</p>
          )}
        </div>
      </Link>
      {showcase ? (
      <span
        data-trade-showcase-badge="1"
        className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-ui-rect bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
      >
        {t("trade_showcase_card_badge")}
      </span>
      ) : !isSoldOrClosed || soldKeepsFavoriteToggle ? (
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
      ) : null}
      {menuEnabled ? (
      /** v5: 화면에 점 세 개 버튼 없음(길게 누름). 키보드·화면 읽기용으로만 남긴다 — 포커스 받으면 보인다 */
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((prev) => (prev ? prev : true));
        }}
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-1 focus-visible:top-1 focus-visible:z-10 focus-visible:rounded-ui-rect focus-visible:bg-white focus-visible:px-2 focus-visible:py-1 focus-visible:text-[12px] focus-visible:text-sam-fg"
        aria-label={t("trade_card_more_menu")}
      >
        {t("trade_card_more_menu")}
      </button>
      ) : null}
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
                    await dibayAlert(
                      data.error
                        ? { title: t("popup_error_title"), description: data.error }
                        : { title: t("trade_detail_delete_failed") }
                    );
                    return;
                  }
                  onMenuAction?.(post.id, "delete_own");
                } catch {
                  await dibayAlert({ title: t("ui_post_delete_network_error") });
                }
              })();
              return;
            }
            if (action === "hide") {
              hideTradePost(post.id);
              return;
            }
            if (action === "report") {
              setReportOpen(true);
              return;
            }
            onMenuAction?.(post.id, action);
          }}
        />
      ) : null}
      {reportModal}
    </div>
  );
});

PostCard.displayName = "PostCard";
