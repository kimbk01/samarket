"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import type { PostWithMeta } from "@/lib/posts/schema";
import { PostDetailView } from "@/components/post/PostDetailView";
import { PostDetailFeedChromeReset } from "@/components/post/PostDetailFeedChromeReset";
import type { TradeItemDetailPageData } from "@/services/trade/trade-detail.service";

/** 가시성·포커스·복원이 겹쳐도 연속 `GET /api/posts/:id` 폭주 방지 — 홈 사일런트 갱신과 유사한 레이트 */
const MIN_LISTING_FIELDS_REFRESH_GAP_MS = 2_500;

type ApiPostRow = {
  status?: string;
  seller_listing_state?: string | null;
  reserved_buyer_id?: string | null;
  type?: string;
  updated_at?: string | null;
};

type Props = {
  initialBundle: TradeItemDetailPageData;
  initialRouteTotalMs?: number;
};

/**
 * 상세 본문은 RSC에서 이미 로드 — 클라이언트는 가시성·포커스 시 목록 필드만 보정.
 */
export function PostDetailPageClient({ initialBundle, initialRouteTotalMs }: Props) {
  const id = initialBundle.item.id;
  const [post, setPost] = useState<PostWithMeta>(initialBundle.item);
  const lastListingFieldsRefreshAtRef = useRef(0);

  useEffect(() => {
    setPost(initialBundle.item);
    // RSC가 매번 새 객체 참조를 넘겨도 본문 동기화는 id·상태 필드가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialBundle.item 참조만 바뀌는 경우 setState 생략
  }, [initialBundle.item.id, initialBundle.item.updated_at, initialBundle.item.status, initialBundle.item.seller_listing_state]);

  const refreshListingFields = useCallback(async () => {
    if (!id) return;
    const now = Date.now();
    if (now - lastListingFieldsRefreshAtRef.current < MIN_LISTING_FIELDS_REFRESH_GAP_MS) return;
    try {
      const res = await runSingleFlight(`post-detail-listing-fields:${id}`, () => {
        lastListingFieldsRefreshAtRef.current = Date.now();
        return fetch(`/api/posts/${id}`, { cache: "no-store" });
      });
      if (!res.ok) return;
      const row = (await res.clone().json()) as ApiPostRow;
      setPost((prev) => {
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
        if (
          prev.status === nextStatus &&
          prev.seller_listing_state === nextSellerListingState &&
          prev.type === nextType &&
          prev.updated_at === nextUpdatedAt &&
          prev.reserved_buyer_id === nextReservedBuyerId
        ) {
          return prev;
        }
        const next: PostWithMeta = { ...prev };
        next.status = nextStatus;
        next.seller_listing_state = nextSellerListingState;
        next.type = nextType;
        next.updated_at = nextUpdatedAt;
        next.reserved_buyer_id = nextReservedBuyerId;
        return next;
      });
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
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

  useRefetchOnPageShowRestore(() => void refreshListingFields(), { enableVisibilityRefetch: false });

  return (
    <>
      <PostDetailFeedChromeReset />
      <PostDetailView
        post={post}
        sellerProfile={initialBundle.sellerProfile ?? null}
        related={{
          sellerItems: initialBundle.sellerItems,
          similarItems: initialBundle.similarItems,
          ads: initialBundle.ads,
        }}
        viewerTradeRoomBootstrap={initialBundle.viewerTradeRoomBootstrap}
        initialRouteTotalMs={initialRouteTotalMs}
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
