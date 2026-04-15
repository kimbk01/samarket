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
};

/**
 * 상세 본문은 RSC에서 이미 로드 — 클라이언트는 가시성·포커스 시 목록 필드만 보정.
 */
export function PostDetailPageClient({ initialBundle }: Props) {
  const id = initialBundle.item.id;
  const [post, setPost] = useState<PostWithMeta>(initialBundle.item);
  const lastListingFieldsRefreshAtRef = useRef(0);

  useEffect(() => {
    setPost(initialBundle.item);
  }, [initialBundle.item]);

  const refreshListingFields = useCallback(async () => {
    if (!id) return;
    const now = Date.now();
    if (now - lastListingFieldsRefreshAtRef.current < MIN_LISTING_FIELDS_REFRESH_GAP_MS) return;
    await runSingleFlight(`post-detail-listing-fields:${id}`, async () => {
      lastListingFieldsRefreshAtRef.current = Date.now();
      try {
        const res = await fetch(`/api/posts/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const row = (await res.json()) as ApiPostRow;
        setPost((prev) => {
          if (!prev || prev.id !== id) return prev;
          const next: PostWithMeta = { ...prev };
          if (typeof row.status === "string" && row.status) {
            next.status = row.status as PostWithMeta["status"];
          }
          if (row.seller_listing_state === null) {
            next.seller_listing_state = undefined;
          } else if (typeof row.seller_listing_state === "string") {
            next.seller_listing_state = row.seller_listing_state;
          }
          if (typeof row.type === "string" && row.type) {
            next.type = row.type as PostWithMeta["type"];
          }
          if (typeof row.updated_at === "string" && row.updated_at) {
            next.updated_at = row.updated_at;
          }
          if (row.reserved_buyer_id === null || row.reserved_buyer_id === undefined) {
            next.reserved_buyer_id = undefined;
          } else if (typeof row.reserved_buyer_id === "string") {
            next.reserved_buyer_id = row.reserved_buyer_id.trim() || undefined;
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    });
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
  }, [id, post.id, refreshListingFields]);

  useRefetchOnPageShowRestore(() => void refreshListingFields(), { enableVisibilityRefetch: false });

  return (
    <>
      <PostDetailFeedChromeReset />
      <PostDetailView
        post={post}
        related={{
          sellerItems: initialBundle.sellerItems,
          similarItems: initialBundle.similarItems,
          ads: initialBundle.ads,
        }}
      />
    </>
  );
}

export function PostDetailConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center text-[14px] text-sam-muted">
      서버 설정이 필요합니다.
    </div>
  );
}
