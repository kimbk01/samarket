"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getFavoritedPosts, type FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { FavoritePostCard } from "./FavoritePostCard";

export function FavoriteProductsView() {
  const [posts, setPosts] = useState<FavoritedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getFavoritedPosts();
    setPosts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  const user = getCurrentUser();

  if (!user?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[14px] text-gray-600">로그인하면 찜한 상품을 볼 수 있어요</p>
        <a href="/my/account" className="mt-4 text-[14px] font-medium text-signature">
          로그인
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
        <p className="mt-3 text-[14px] text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[14px] text-gray-600">찜한 상품이 없어요</p>
        <p className="mt-1 text-[12px] text-gray-400">
          홈이나 상품 상세에서 하트를 눌러 관심 상품을 담아 보세요.
        </p>
        <a href="/home" className="mt-4 text-[14px] font-medium text-signature">
          홈으로 가기
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-2 px-4 py-3 pb-24">
      {posts.map((post) => (
        <FavoritePostCard
          key={post.id}
          post={post}
          onUnfavorite={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
        />
      ))}
    </div>
  );
}
