"use client";

import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { PostCard } from "@/components/post/PostCard";
import { FavoritePostTradeActions } from "@/components/favorites/FavoritePostTradeActions";
import type { PostListMenuAction } from "@/components/post/PostListMenuBottomSheet";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";

interface FavoritePostCardProps {
  post: FavoritedPost;
  onUnfavorite?: () => void;
}

/** 찜 목록 카드 — 홈/카테고리 리스트와 동일한 PostCard + composition overlay */
export function FavoritePostCard({ post, onUnfavorite }: FavoritePostCardProps) {
  const { propsForCategoryId } = useTradeListCompositionMap();
  const composition = propsForCategoryId(post.category_id);
  /** 볼 수 없는 글(숨김·삭제, 남의 글) — 카드는 흐리게(PostCard), 채팅·판매자 정보 버튼은 두지 않는다. 찜 해제는 하트로 */
  const status = String(post.status ?? "").toLowerCase();
  const unavailable =
    (status === "hidden" || status === "deleted") &&
    postAuthorUserId(post as unknown as Record<string, unknown>) !== (getCurrentUser()?.id ?? "");
  return (
    <PostCard
      post={post}
      isFavorite={true}
      skinKey={composition?.skinKey}
      categorySlug={composition?.categorySlug}
      fieldComposition={composition?.fieldComposition}
      onFavoriteChange={(_postId, isFavorite) => {
        if (!isFavorite) onUnfavorite?.();
      }}
      onMenuAction={(_postId, action: PostListMenuAction) => {
        if (action === "delete_own") onUnfavorite?.();
      }}
      footer={unavailable ? undefined : <FavoritePostTradeActions post={post} />}
      /** 찜 목록은 판매완료 글도 찜 해제로 정리할 수 있어야 한다(카드 자체는 판매완료 비활성) */
      soldKeepsFavoriteToggle
    />
  );
}
