"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getFavoritedPosts, type FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import {
  FAVORITE_MANAGE_TABS,
  countFavoriteManageTabs,
  filterFavoritesByTab,
  type FavoriteManageTabId,
} from "@/lib/mypage/favorite-manage-tabs";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { FavoritePostCard } from "./FavoritePostCard";

export function FavoriteProductsView({
  embedded = false,
  initialTab,
}: {
  embedded?: boolean;
  initialTab?: FavoriteManageTabId;
} = {}) {
  const { t } = useI18n();
  const router = useRouter();
  const [posts, setPosts] = useState<FavoritedPost[]>([]);
  const [loading, setLoading] = useState(true);
  /** 서버 세션 여부 — `getCurrentUser()`보다 늦게 맞춰도 찜 목록은 표시 */
  const [sessionAuthenticated, setSessionAuthenticated] = useState<boolean | null>(null);
  const [tab, setTab] = useState<FavoriteManageTabId>(initialTab ?? "all");
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { items, authenticated } = await getFavoritedPosts();
    setPosts(items);
    setSessionAuthenticated(authenticated);
    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const counts = useMemo(() => countFavoriteManageTabs(posts), [posts]);
  const filtered = useMemo(() => filterFavoritesByTab(posts, tab), [posts, tab]);

  useEffect(() => {
    if (!mounted) return;
    void load();
  }, [mounted, load]);

  useEffect(() => {
    const onAuth = () => void load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useEffect(() => {
    const onPostFav = () => void load();
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onPostFav);
    return () => window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onPostFav);
  }, [load]);

  /** 서버 세션 없음 → 로그인 화면 */
  useLayoutEffect(() => {
    if (loading || sessionAuthenticated === null) return;
    if (!sessionAuthenticated) {
      const next =
        typeof window !== "undefined" && window.location.pathname !== "/mypage/account"
          ? `?next=${encodeURIComponent(window.location.pathname)}`
          : "";
      router.replace(`/mypage/account${next}`);
    }
  }, [loading, sessionAuthenticated, router]);

  if (!mounted) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-12"}`}>
        <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
        <p className="mt-3 text-[14px] text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  if (loading || sessionAuthenticated === null) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-12"}`}>
        <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
        <p className="mt-3 text-[14px] text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  if (!sessionAuthenticated) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-16"}`}>
        <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
        <p className="mt-3 text-[14px] text-sam-muted">{t("ui_fav_redirect_login")}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-16"}`}>
        <p className="text-[14px] text-sam-muted">{t("ui_fav_empty_title")}</p>
        <p className="mt-1 text-[12px] text-sam-meta">
          {t("ui_fav_empty_hint")}
        </p>
        {!embedded ? (
          <Link href="/philife" className="mt-4 text-[14px] font-medium text-signature">
            {t("ui_fav_go_home")}
          </Link>
        ) : null}
      </div>
    );
  }

  const emptyTabMsg = useMemo(
    (): Record<FavoriteManageTabId, string> => ({
      all: t("ui_fav_tab_empty_all"),
      active: t("ui_fav_tab_empty_active"),
      sold: t("ui_fav_tab_empty_sold"),
      gone: t("ui_fav_tab_empty_gone"),
    }),
    [t]
  );

  return (
    <div className={embedded ? "flex flex-col gap-2" : "mx-auto flex max-w-lg flex-col gap-2 px-4 py-3 pb-24"}>
      <TradeManagementTabBar tabs={FAVORITE_MANAGE_TABS} active={tab} counts={counts} onChange={setTab} />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-sam-muted">{emptyTabMsg[tab]}</p>
      ) : (
        <ul className="m-0 min-w-0 w-full list-none divide-y divide-sam-border p-0">
          {filtered.map((post) => (
            <li key={post.id} className="min-w-0">
              <FavoritePostCard
                post={post}
                onUnfavorite={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
