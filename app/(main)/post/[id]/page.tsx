"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getPostById } from "@/lib/posts/getPostById";
import type { PostWithMeta } from "@/lib/posts/schema";
import { PostDetailView } from "@/components/post/PostDetailView";
import { PostDetailFeedChromeReset } from "@/components/post/PostDetailFeedChromeReset";
import { AppBackButton } from "@/components/navigation/AppBackButton";

type ApiPostRow = {
  status?: string;
  seller_listing_state?: string | null;
  reserved_buyer_id?: string | null;
  type?: string;
  updated_at?: string | null;
};

export default function PostDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [post, setPost] = useState<PostWithMeta | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!id) return;
    setPost(undefined);
    const bundle = await getPostById(id);
    if (!bundle) {
      setPost(null);
      return;
    }
    setPost(bundle.post);
  }, [id]);

  /** 서비스 롤 API로 거래 단계·status 갱신 (클라이언트 RLS/캐시와 무관) */
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
    load();
  }, [load]);

  useEffect(() => {
    if (!id || !post) return;
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
  }, [id, post?.id, refreshListingFields]);

  useRefetchOnPageShowRestore(() => void refreshListingFields(), { enableVisibilityRefetch: false });

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[14px] text-sam-muted">
        잘못된 접근입니다.
      </div>
    );
  }

  return (
    <>
      <PostDetailFeedChromeReset />
      {post === undefined ? (
        <div className="flex min-h-screen items-center justify-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      ) : post === null ? (
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-[15px] font-medium text-sam-fg">글을 찾을 수 없습니다.</p>
          <div className="mt-4 flex justify-center">
            <AppBackButton className="text-signature hover:bg-signature/10" />
          </div>
        </div>
      ) : (
        <PostDetailView post={post} />
      )}
    </>
  );
}
