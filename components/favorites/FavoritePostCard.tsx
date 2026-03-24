"use client";

import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { PostCard } from "@/components/post/PostCard";

interface FavoritePostCardProps {
  post: FavoritedPost;
  onUnfavorite?: () => void;
}

/** 찜 목록 카드 — 홈/카테고리 리스트와 동일한 PostCard 스타일(부동산/중고차/일반 거래) 적용 */
export function FavoritePostCard({ post, onUnfavorite }: FavoritePostCardProps) {
  return (
    <PostCard
      post={post}
      isFavorite={true}
      onFavoriteChange={(_postId, isFavorite) => {
        if (!isFavorite) onUnfavorite?.();
      }}
    />
  );
}
