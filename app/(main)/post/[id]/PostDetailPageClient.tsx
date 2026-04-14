"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import type { PostWithMeta } from "@/lib/posts/schema";
import { PostDetailView } from "@/components/post/PostDetailView";
import { PostDetailFeedChromeReset } from "@/components/post/PostDetailFeedChromeReset";

type ApiPostRow = {
  status?: string;
  seller_listing_state?: string | null;
  reserved_buyer_id?: string | null;
  type?: string;
  updated_at?: string | null;
};

type Props = {
  initialPost: PostWithMeta;
};

/**
 * 상세 본문은 RSC에서 이미 로드 — 클라이언트는 가시성·포커스 시 목록 필드만 보정.
 */
export function PostDetailPageClient({ initialPost }: Props) {
  const id = initialPost.id;
  const [post, setPost] = useState<PostWithMeta>(initialPost);

  useEffect(() => {
    setPost(initialPost);
  }, [initialPost]);

  const refreshListingFields = useCallback(async () => {
    if (!id) return;
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
      <PostDetailView post={post} />
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
