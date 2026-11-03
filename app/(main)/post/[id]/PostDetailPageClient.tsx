"use client";

/**
 * 거래 상세 클라 — related 는 RSC `Suspense` 슬롯(`PostDetailRelatedDeferredLoader` → `getTradeDetailRelatedData`)으로 스트림.
 *
 * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { postNotificationThreadRead } from "@/lib/notifications/client/notification-event-read-client";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { postHasTradePromotionOverlay, TRADE_PROMOTION_PROJECTION } from "@/lib/promotion/trade-promotion-overlay";
import type { PostWithMeta } from "@/lib/posts/schema";
import { PostDetailView } from "@/components/post/PostDetailView";
import { PostDetailFeedChromeReset } from "@/components/post/PostDetailFeedChromeReset";
import type { TradeItemDetailPageData } from "@/services/trade/trade-detail.service";
import { TradePostUnavailable } from "@/components/trade/TradePostUnavailable";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { noteTradeListingVisibility, useTradeListingRemoved } from "@/lib/trade/listing-visibility/listing-visibility-client";

/** 가시성·포커스·복원이 겹쳐도 연속 `GET /api/posts/:id` 폭주 방지 — 홈 사일런트 갱신과 유사한 레이트 */
const MIN_LISTING_FIELDS_REFRESH_GAP_MS = 2_500;
const TRADE_DETAIL_LISTING_FIELDS_CACHE_TTL_MS = 15_000;
const TRADE_DETAIL_LISTING_FIELDS_CACHE_MAX_KEYS = 80;

type ApiPostRow = {
  status?: string;
  seller_listing_state?: string | null;
  reserved_buyer_id?: string | null;
  type?: string;
  updated_at?: string | null;
  /** 재감사 B-5①: 지금 광고 중(상세 첫 화면과 같은 판정) — 없으면 바꾸지 않는다 */
  promotion_live?: boolean;
};

type ListingFieldsSnapshot = {
  status?: string;
  seller_listing_state?: string | null;
  reserved_buyer_id?: string | null;
  type?: string;
  updated_at?: string | null;
  promotion_live?: boolean;
  expiresAt: number;
};

type Props = {
  initialBundle: TradeItemDetailPageData;
  initialRouteTotalMs?: number;
  children?: ReactNode;
};

const tradeDetailListingFieldsCache = new Map<string, ListingFieldsSnapshot>();

function isRemovedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "hidden" || s === "deleted";
}

function applyListingFieldsRow(prev: PostWithMeta, row: ApiPostRow, id: string): PostWithMeta {
  if (!prev || prev.id !== id) return prev;
  const nextStatus =
    typeof row.status === "string" && row.status
      ? (row.status as PostWithMeta["status"])
      : prev.status;
  const nextSellerListingState =
    row.seller_listing_state === null
      ? undefined
      : typeof row.seller_listing_state === "string"
        ? row.seller_listing_state
        : prev.seller_listing_state;
  const nextType =
    typeof row.type === "string" && row.type
      ? (row.type as PostWithMeta["type"])
      : prev.type;
  const nextUpdatedAt =
    typeof row.updated_at === "string" && row.updated_at ? row.updated_at : prev.updated_at;
  const nextReservedBuyerId =
    row.reserved_buyer_id === null || row.reserved_buyer_id === undefined
      ? undefined
      : typeof row.reserved_buyer_id === "string"
        ? row.reserved_buyer_id.trim() || undefined
        : prev.reserved_buyer_id;
  const prevPromoted = postHasTradePromotionOverlay(prev);
  const nextPromoted = typeof row.promotion_live === "boolean" ? row.promotion_live : prevPromoted;
  if (
    prev.status === nextStatus &&
    prev.seller_listing_state === nextSellerListingState &&
    prev.type === nextType &&
    prev.updated_at === nextUpdatedAt &&
    prev.reserved_buyer_id === nextReservedBuyerId &&
    prevPromoted === nextPromoted
  ) {
    return prev;
  }
  const next: PostWithMeta = { ...prev };
  next.status = nextStatus;
  next.seller_listing_state = nextSellerListingState;
  next.type = nextType;
  next.updated_at = nextUpdatedAt;
  next.reserved_buyer_id = nextReservedBuyerId;
  if (prevPromoted !== nextPromoted) {
    const meta = { ...((prev.meta as Record<string, unknown> | null | undefined) ?? {}) };
    if (nextPromoted) meta.promotion_projection = TRADE_PROMOTION_PROJECTION;
    else delete meta.promotion_projection;
    next.meta = meta as PostWithMeta["meta"];
  }
  return next;
}

/**
 * 상세 본문은 RSC에서 이미 로드 — 클라이언트는 가시성·포커스 시 목록 필드만 보정.
 */
export function PostDetailPageClient({ initialBundle, initialRouteTotalMs, children }: Props) {
  const id = initialBundle.item.id;
  const [post, setPost] = useState<PostWithMeta>(initialBundle.item);
  const related = useMemo(
    () => ({
      sellerItems: initialBundle.sellerItems,
      similarItems: initialBundle.similarItems,
      ads: initialBundle.ads,
    }),
    [initialBundle.sellerItems, initialBundle.similarItems, initialBundle.ads]
  );
  const hasRelatedSlot = Boolean(children);
  const lastListingFieldsRefreshAtRef = useRef(0);
  const detailMountedRef = useRef(true);
  const tradeStatusNotificationReadOnceRef = useRef<string | null>(null);
  /**
   * 설계 §1-3 L-4: 열어 둔 상세에서 글이 숨김·삭제되면(방송·복귀 재확인·없어짐) 작성자가 아닌 사람은 「볼 수 없는 글이에요」.
   * 처음부터 숨김 상태로 열린 상세(작성자·관리자만 서버가 연다)는 바꾸지 않는다.
   */
  const openedVisibleRef = useRef(!isRemovedStatus(initialBundle.item.status));
  const [goneOnServer, setGoneOnServer] = useState(false);
  const removedByBroadcast = useTradeListingRemoved(id);

  useEffect(() => {
    const productId = id?.trim();
    if (!productId) return;
    if (tradeStatusNotificationReadOnceRef.current === productId) return;
    tradeStatusNotificationReadOnceRef.current = productId;
    void postNotificationThreadRead(productId, {
      threadType: "trade_room",
      readReason: "trade_detail_opened",
      categories: ["trade_status"],
    });
  }, [id]);

  // Morph coordinator owns cover release — do not clear morph session here.

  useEffect(() => {
    setPost(initialBundle.item);
    // RSC가 매번 새 객체 참조를 넘겨도 본문 동기화는 id·상태 필드가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialBundle.item 참조만 바뀌는 경우 setState 생략
  }, [initialBundle.item.id, initialBundle.item.updated_at, initialBundle.item.status, initialBundle.item.seller_listing_state]);

  /** fresh: 상세가 나타날 때·bfcache 복원 — 15초 캐시를 건너뛴다 (재감사 B-4: 15초 안에 뒤로 오면 옛 상태) */
  const refreshListingFields = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!id) return;
    const now = Date.now();
    if (now - lastListingFieldsRefreshAtRef.current < MIN_LISTING_FIELDS_REFRESH_GAP_MS) return;
    pruneByExpiresAtAndMaxSize(tradeDetailListingFieldsCache, now, TRADE_DETAIL_LISTING_FIELDS_CACHE_MAX_KEYS);
    const cached = opts?.fresh ? undefined : tradeDetailListingFieldsCache.get(id);
    if (cached && cached.expiresAt > now) {
      if (!detailMountedRef.current) return;
      setPost((prev) => applyListingFieldsRow(prev, cached, id));
      lastListingFieldsRefreshAtRef.current = now;
      return;
    }
    try {
      const res = await runSingleFlight(`post-detail-listing-fields:${id}`, () => {
        lastListingFieldsRefreshAtRef.current = Date.now();
        return fetch(`/api/posts/${id}`, { cache: "no-store" });
      });
      if (!detailMountedRef.current) return;
      if (res.status === 404) {
        setGoneOnServer(true);
        noteTradeListingVisibility(id, false);
        return;
      }
      if (!res.ok) return;
      const row = (await res.clone().json()) as ApiPostRow;
      if (!detailMountedRef.current) return;
      if (isRemovedStatus(row.status)) noteTradeListingVisibility(id, false);
      tradeDetailListingFieldsCache.set(id, {
        status: row.status,
        seller_listing_state: row.seller_listing_state,
        reserved_buyer_id: row.reserved_buyer_id,
        type: row.type,
        updated_at: row.updated_at,
        promotion_live: row.promotion_live,
        expiresAt: Date.now() + TRADE_DETAIL_LISTING_FIELDS_CACHE_TTL_MS,
      });
      pruneByExpiresAtAndMaxSize(
        tradeDetailListingFieldsCache,
        Date.now(),
        TRADE_DETAIL_LISTING_FIELDS_CACHE_MAX_KEYS
      );
      setPost((prev) => applyListingFieldsRow(prev, row, id));
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    detailMountedRef.current = true;
    return () => {
      detailMountedRef.current = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    /**
     * 상세가 화면에 나타날 때마다 판매 상태 1회 — 라우터 캐시(5분)로 뒤로 가기 복원된 화면도 최신 상태로
     * (실기 2026-11-04 F-F: 판매완료 뒤에도 「판매중」·「채팅 이어가기」). 같은 요청 1회·2.5초 간격·15초 캐시는 그대로.
     */
    void refreshListingFields({ fresh: true });
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshListingFields();
    };
    const onFocus = () => void refreshListingFields();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [id, refreshListingFields]);

  useRefetchOnPageShowRestore(() => void refreshListingFields({ fresh: true }), { enableVisibilityRefetch: false });

  const viewerUserId =
    typeof initialBundle.viewerUserId === "string" && initialBundle.viewerUserId.trim()
      ? initialBundle.viewerUserId.trim()
      : "";
  const viewerIsAuthor =
    !!viewerUserId && (postAuthorUserId(post as unknown as Record<string, unknown>) || "") === viewerUserId;
  if (
    openedVisibleRef.current &&
    !viewerIsAuthor &&
    (goneOnServer || removedByBroadcast || isRemovedStatus(post.status))
  ) {
    return <TradePostUnavailable />;
  }

  return (
    <>
      <PostDetailFeedChromeReset />
      <PostDetailView
        post={post}
        sellerProfile={initialBundle.sellerProfile ?? null}
        related={hasRelatedSlot ? undefined : related}
        relatedSectionsSlot={hasRelatedSlot ? children : undefined}
        viewerTradeRoomBootstrap={initialBundle.viewerTradeRoomBootstrap}
        initialRouteTotalMs={initialRouteTotalMs}
        serverViewerUserId={
          typeof initialBundle.viewerUserId === "string" && initialBundle.viewerUserId.trim()
            ? initialBundle.viewerUserId.trim()
            : undefined
        }
      />
    </>
  );
}

export function PostDetailConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center sam-text-body text-sam-muted">
      서버 설정이 필요합니다.
    </div>
  );
}
