"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getFavoritedStores } from "@/lib/stores/get-favorited-stores-client";
import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";
import { STORE_FAVORITE_CHANGED_EVENT } from "@/lib/stores/store-favorite-events";
import { FavoriteStoreRow } from "@/components/favorites/FavoriteStoreRow";

export function FavoriteStoresView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const router = useRouter();
  const [stores, setStores] = useState<FavoritedStoreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionAuthenticated, setSessionAuthenticated] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { items, authenticated } = await getFavoritedStores();
    setStores(items);
    setSessionAuthenticated(authenticated);
    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const onFav = () => void load();
    window.addEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
  }, [load]);

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

  const emptyHint = useMemo(
    () => (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-16"}`}>
        <p className="text-[14px] text-sam-muted">{t("ui_fav_store_empty_title")}</p>
        <p className="mt-1 text-[12px] text-sam-meta">{t("ui_fav_store_empty_hint")}</p>
        {!embedded ? (
          <Link href="/stores" className="mt-4 text-[14px] font-medium text-signature">
            {t("ui_fav_store_go_stores")}
          </Link>
        ) : null}
      </div>
    ),
    [embedded, t]
  );

  if (!mounted || loading || sessionAuthenticated === null) {
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

  if (stores.length === 0) {
    return emptyHint;
  }

  return (
    <ul className={`m-0 min-w-0 w-full list-none divide-y divide-sam-border p-0 ${embedded ? "" : "px-1"}`}>
      {stores.map((store) => (
        <li key={store.id} className="min-w-0">
          <FavoriteStoreRow store={store} />
        </li>
      ))}
    </ul>
  );
}
