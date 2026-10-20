"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getFavoritedStores } from "@/lib/stores/get-favorited-stores-client";
import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";
import {
  STORE_FAVORITE_CHANGED_EVENT,
  type StoreFavoriteChangedDetail,
} from "@/lib/stores/store-favorite-events";
import { fetchStoreFavoriteMutation } from "@/lib/stores/store-delivery-api-client";
import { FavoriteStoreRow } from "@/components/favorites/FavoriteStoreRow";
import { MyStateView } from "@/components/mypage/ds";
import { showMypageToast, showMypageUndoToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { Sam } from "@/lib/ui/sam-component-classes";

type Removed = { store: FavoritedStoreListItem; index: number };

/**
 * 찜한 매장 (최종 설계 S22 매장 탭).
 * - 오류(500·네트워크)는 오류 + 다시 시도. 로그인 이동은 401/`authenticated:false` 만(`get-favorited-stores-client`).
 * - 하트 해제(행의 `useStoreFavoriteToggle` 가 보내는 `favorited:false` 이벤트) → 목록에서 제거 + [되돌리기] 5초
 *   → 같은 즐겨찾기 API(POST) 재등록 + 원래 위치 복원(C6).
 */
export function FavoriteStoresView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const router = useRouter();
  const [stores, setStores] = useState<FavoritedStoreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState<boolean | null>(null);
  const storesRef = useRef(stores);
  const removedRef = useRef(new Map<string, Removed>());
  const restoringRef = useRef(new Set<string>());

  useEffect(() => {
    storesRef.current = stores;
  }, [stores]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    const { items, authenticated, error } = await getFavoritedStores();
    if (silent && error) return; // 조용한 재조회 실패 — 기존 목록 유지
    setStores(items);
    setLoadError(Boolean(error));
    setSessionAuthenticated(authenticated);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => void load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  const undo = useCallback(
    async (slug: string) => {
      const removed = removedRef.current.get(slug);
      if (!removed) return;
      restoringRef.current.add(slug);
      try {
        const { status, json } = await fetchStoreFavoriteMutation(slug, "POST");
        const j = json as { ok?: boolean; favorited?: boolean; favorite_count?: unknown };
        if (status >= 400 || !j?.ok || j.favorited === false) {
          showMypageToast(t("mypage_r5_trade_undo_failed"), "error");
          return;
        }
        removedRef.current.delete(slug);
        setStores((prev) => {
          if (prev.some((s) => s.slug === slug)) return prev;
          const next = [...prev];
          next.splice(Math.min(removed.index, next.length), 0, removed.store);
          return next;
        });
        invalidateMypageSummary();
        window.dispatchEvent(
          new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
            detail: { slug, favorited: true, favorite_count: Number(j.favorite_count) || 0 },
          })
        );
      } catch {
        showMypageToast(t("mypage_r5_trade_undo_failed"), "error");
      } finally {
        restoringRef.current.delete(slug);
      }
    },
    [t]
  );

  useEffect(() => {
    const onFav = (e: Event) => {
      const d = (e as CustomEvent<StoreFavoriteChangedDetail>).detail;
      const slug = d?.slug ?? "";
      if (slug && restoringRef.current.has(slug)) return;
      if (slug && d?.favorited === false) {
        const index = storesRef.current.findIndex((s) => s.slug === slug);
        if (index >= 0) {
          const store = storesRef.current[index]!;
          removedRef.current.set(slug, { store, index });
          setStores((prev) => prev.filter((s) => s.slug !== slug));
          invalidateMypageSummary();
          showMypageUndoToast(t("mypage_r5_fav_unfavorited"), () => void undo(slug), t("mypage_comp_ds_undo"));
          return;
        }
        if (removedRef.current.has(slug)) return; // 같은 해제의 서버 확정 이벤트
      }
      if (slug && d?.favorited === true && removedRef.current.has(slug)) {
        // 서버 해제 실패 롤백 — 원래 위치로
        const removed = removedRef.current.get(slug)!;
        removedRef.current.delete(slug);
        setStores((prev) => {
          if (prev.some((s) => s.slug === slug)) return prev;
          const next = [...prev];
          next.splice(Math.min(removed.index, next.length), 0, removed.store);
          return next;
        });
        return;
      }
      void load({ silent: true });
    };
    window.addEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
  }, [load, t, undo]);

  useLayoutEffect(() => {
    if (loading || sessionAuthenticated === null || loadError) return;
    if (!sessionAuthenticated) {
      const next =
        typeof window !== "undefined" && window.location.pathname !== "/mypage/account"
          ? `?next=${encodeURIComponent(window.location.pathname)}`
          : "";
      router.replace(`/mypage/account${next}`);
    }
  }, [loading, loadError, sessionAuthenticated, router]);

  if (loading || (sessionAuthenticated === null && !loadError)) {
    return <FavoriteStoresSkeleton />;
  }

  if (loadError) {
    return (
      <MyStateView kind="error" error={{ message: t("ui_fav_load_failed"), onRetry: () => void load() }} />
    );
  }

  if (!sessionAuthenticated) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-16"}`}>
        <p className="mt-3 text-[14px] text-sam-muted">{t("ui_fav_redirect_login")}</p>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{
          icon: <Store className="h-6 w-6" aria-hidden />,
          title: t("ui_fav_store_empty_title"),
          body: t("ui_fav_store_empty_hint"),
          cta: (
            <Link href="/stores" className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}>
              {t("ui_fav_store_go_stores")}
            </Link>
          ),
        }}
      />
    );
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

/** 매장 탭 스켈레톤 — 행 5개(48 원형 + 2줄) (최종 설계 S22) */
function FavoriteStoresSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="fav-store-skeleton" className="m-0 list-none divide-y divide-sam-border p-0">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <span className="h-12 w-12 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 w-[55%] ${bone}`} />
            <span className={`h-3 w-[35%] ${bone}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}
