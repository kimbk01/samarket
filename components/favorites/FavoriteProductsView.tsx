"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getFavoritedPostsPage,
  type FavoritedPostPageItem,
} from "@/lib/favorites/getFavoritedPosts";
import { POST_FAVORITE_CHANGED_EVENT, type PostFavoriteChangedDetail } from "@/lib/favorites/post-favorite-events";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import {
  FAVORITE_MANAGE_TABS,
  getFavoriteManageTabId,
  type FavoriteManageTabId,
} from "@/lib/mypage/favorite-manage-tabs";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { MYPAGE_TOAST_ACTION_MS, showMypageToast, showMypageUndoToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { useMypageCursorList, type MypageCursorPage } from "@/lib/mypage/use-mypage-cursor-list";
import { Sam } from "@/lib/ui/sam-component-classes";
import { FavoritePostCard } from "./FavoritePostCard";
import { TRADE_FEED_PRODUCT_GRID_CLASS } from "@/lib/posts/trade-feed-layout-classes";

const CHIP_IDS = FAVORITE_MANAGE_TABS.map((x) => x.id) as readonly FavoriteManageTabId[];
const EMPTY_COUNTS: Record<FavoriteManageTabId, number> = { all: 0, active: 0, sold: 0, gone: 0 };

/**
 * P-3 (F1): 칩 개수는 목록 캐시와 같은 수명으로 보관한다 — 캐시로 목록을 복원하면 `fetchPage` 가 불리지 않아
 * 개수가 0 으로 보이던 문제(「중고거래 (6)」인데 「전체 찜 (0)」).
 */
const favoriteCountsCache = new Map<string, Record<FavoriteManageTabId, number>>();

/** 되돌리기 대기 중 항목 — 원래 위치 복원용 */
type PendingRestore = { post: FavoritedPostPageItem; index: number };

type FavoriteProductsViewProps = {
  embedded?: boolean;
  initialTab?: FavoriteManageTabId;
  /** FavoritesHubView 내부 — 바깥 패딩 중복 방지 */
  hideOuterPadding?: boolean;
  /** 칩 `?chip=` URL 유지 (찜 허브 화면) */
  syncUrl?: boolean;
};

/**
 * 찜한 상품 (최종 설계 S22) — 칩 [전체·판매중·거래완료·삭제됨](서버 전체 개수, A2 `counts`) → `PostCard` 그리드 → 더 보기.
 * - 하트 해제(마켓 `PostCard` 안에서 서버 토글 완료 후 콜백) → 목록에서 제거 + [되돌리기] 5초 → `toggleFavorite` 재호출 + 원래 위치(C6).
 * - 오류는 빈 목록·로그인 이동이 아니라 오류 + 다시 시도(D10·D11). 비로그인(`authenticated:false`)만 로그인.
 * - `syncUrl` 이면 칩을 `?chip=` 로 유지(찜 허브 화면). 홈 시트·패널 임베드는 로컬 상태.
 */
export function FavoriteProductsView(props: FavoriteProductsViewProps = {}) {
  return props.syncUrl ? <FavoriteProductsUrlChip {...props} /> : <FavoriteProductsLocalChip {...props} />;
}

/** `useSearchParams` 는 URL 동기화 화면에서만 — 홈 시트·패널 임베드는 로컬 상태 */
function FavoriteProductsUrlChip(props: FavoriteProductsViewProps) {
  const [tab, setTab] = useMypageTabParam<FavoriteManageTabId>({
    key: "chip",
    values: CHIP_IDS,
    defaultValue: "all",
  });
  return <FavoriteProductsBody {...props} tab={tab} setTab={setTab} />;
}

function FavoriteProductsLocalChip(props: FavoriteProductsViewProps) {
  const [tab, setTab] = useState<FavoriteManageTabId>(props.initialTab ?? "all");
  const { initialTab } = props;
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  return <FavoriteProductsBody {...props} tab={tab} setTab={setTab} />;
}

function FavoriteProductsBody({
  embedded = false,
  hideOuterPadding = false,
  tab,
  setTab,
}: FavoriteProductsViewProps & { tab: FavoriteManageTabId; setTab: (next: FavoriteManageTabId) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [viewerKey, setViewerKey] = useState<string>(() => getCurrentUser()?.id ?? "session");
  /** 서버 세션 여부 — `getCurrentUser()`보다 늦게 맞춰도 찜 목록은 표시 */
  const [sessionAuthenticated, setSessionAuthenticated] = useState<boolean | null>(null);
  const [counts, setCountsState] = useState<Record<FavoriteManageTabId, number> | null>(
    () => favoriteCountsCache.get(viewerKey) ?? null
  );
  const viewerKeyRef = useRef(viewerKey);
  viewerKeyRef.current = viewerKey;
  const setCounts = useCallback(
    (
      next:
        | Record<FavoriteManageTabId, number>
        | ((prev: Record<FavoriteManageTabId, number> | null) => Record<FavoriteManageTabId, number>)
    ) => {
      setCountsState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        favoriteCountsCache.set(viewerKeyRef.current, value);
        return value;
      });
    },
    []
  );
  const pendingRef = useRef(new Map<string, PendingRestore>());

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<FavoritedPostPageItem>> => {
      const r = await getFavoritedPostsPage({ chip: tab, cursor, withCounts: true });
      setSessionAuthenticated(r.authenticated);
      if (r.counts) setCounts(r.counts);
      return { items: r.items, next_cursor: r.next_cursor };
    },
    [setCounts, tab]
  );

  const list = useMypageCursorList<FavoritedPostPageItem>({
    cacheKey: `fav:posts:${viewerKey}:${tab}`,
    fetchPage,
    getId: (p) => String(p.id),
  });
  const { reload, setItems } = list;
  const itemsRef = useRef(list.items);
  useEffect(() => {
    itemsRef.current = list.items;
  }, [list.items]);

  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  /** 캐시 복원으로 개수가 없으면 개수만 한 번 받아 온다 */
  const countsMissing = counts == null && list.status === "ready";
  useEffect(() => {
    if (!countsMissing) return;
    let cancelled = false;
    void getFavoritedPostsPage({ chip: tab, cursor: null, limit: 1, withCounts: true }).then((r) => {
      if (!cancelled && r.counts) setCounts(r.counts);
    });
    return () => {
      cancelled = true;
    };
  }, [countsMissing, setCounts, tab]);

  /** 훅은 아래 조건부 return 보다 먼저 — 로딩→목록 전환 시 훅 개수가 바뀌면 React 오류(#310) */
  const emptyTabMsg = useMemo(
    (): Record<FavoriteManageTabId, string> => ({
      all: t("ui_fav_tab_empty_all"),
      active: t("ui_fav_tab_empty_active"),
      sold: t("ui_fav_tab_empty_sold"),
      gone: t("ui_fav_tab_empty_gone"),
    }),
    [t]
  );

  useEffect(() => {
    const onAuth = () => {
      setViewerKey(getCurrentUser()?.id ?? "session");
      void reload();
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [reload]);

  /** 다른 화면(상세·피드)에서 찜이 바뀌면 조용히 첫 페이지만 교체. 이 화면에서 해제·되돌리기한 글은 로컬 상태가 기준. */
  useEffect(() => {
    const onPostFav = (e: Event) => {
      const detail = (e as CustomEvent<PostFavoriteChangedDetail>).detail;
      const postId = detail?.postId;
      if (postId && pendingRef.current.has(postId)) return;
      // 이 목록의 하트 해제 — 카드 콜백(`handleUnfavorited`)이 로컬로 처리
      if (postId && detail?.isFavorite === false && itemsRef.current.some((p) => String(p.id) === postId)) return;
      void reload();
    };
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onPostFav);
    return () => window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onPostFav);
  }, [reload]);

  /** 서버 세션 없음 → 로그인 화면 */
  useLayoutEffect(() => {
    if (sessionAuthenticated !== false) return;
    const next =
      typeof window !== "undefined" && window.location.pathname !== "/mypage/account"
        ? `?next=${encodeURIComponent(window.location.pathname)}`
        : "";
    router.replace(`/mypage/account${next}`);
  }, [sessionAuthenticated, router]);

  const bumpCounts = useCallback((post: FavoritedPostPageItem, delta: number) => {
    setCounts((prev) => {
      const base = prev ?? EMPTY_COUNTS;
      const chip = getFavoriteManageTabId(post);
      return { ...base, all: Math.max(0, base.all + delta), [chip]: Math.max(0, base[chip] + delta) };
    });
  }, [setCounts]);

  const undoUnfavorite = useCallback(
    async (postId: string) => {
      const pending = pendingRef.current.get(postId);
      if (!pending) return;
      const res = await toggleFavorite(postId, true);
      if (!res.ok || !res.isFavorite) {
        pendingRef.current.delete(postId);
        showMypageToast(t("mypage_r5_trade_undo_failed"), "error");
        return;
      }
      setItems((prev) => {
        if (prev.some((p) => String(p.id) === postId)) return prev;
        const next = [...prev];
        next.splice(Math.min(pending.index, next.length), 0, pending.post);
        return next;
      });
      bumpCounts(pending.post, 1);
      invalidateMypageSummary();
      // 같은 글의 늦은 이벤트를 흘려보낸 뒤 대기 표시 해제
      window.setTimeout(() => pendingRef.current.delete(postId), 0);
    },
    [bumpCounts, setItems, t]
  );

  const handleUnfavorited = useCallback(
    (post: FavoritedPostPageItem) => {
      const postId = String(post.id);
      const index = list.items.findIndex((p) => String(p.id) === postId);
      pendingRef.current.set(postId, { post, index: index < 0 ? 0 : index });
      setItems((prev) => prev.filter((p) => String(p.id) !== postId));
      bumpCounts(post, -1);
      invalidateMypageSummary();
      showMypageUndoToast(t("mypage_r5_fav_unfavorited"), () => void undoUnfavorite(postId), t("mypage_comp_ds_undo"));
      // 되돌리기 토스트(5초)가 끝나면 대기 표시 해제 — 이후 다른 화면의 찜 변경은 다시 조용한 재조회 대상
      window.setTimeout(() => {
        if (pendingRef.current.get(postId)?.post === post) pendingRef.current.delete(postId);
      }, MYPAGE_TOAST_ACTION_MS + 1000);
    },
    [bumpCounts, list.items, setItems, t, undoUnfavorite]
  );

  const wrapClass = hideOuterPadding
    ? "flex flex-col gap-2"
    : embedded
      ? "flex flex-col gap-2"
      : "mx-auto flex max-w-lg flex-col gap-2 px-4 py-3 pb-24";

  const tabBar = (
    <TradeManagementTabBar tabs={FAVORITE_MANAGE_TABS} active={tab} counts={counts ?? EMPTY_COUNTS} onChange={setTab} />
  );

  if (sessionAuthenticated === false) {
    return (
      <div className={`flex flex-col items-center justify-center text-center ${embedded ? "py-8" : "py-16"}`}>
        <p className="mt-3 text-[14px] text-sam-muted">{t("ui_fav_redirect_login")}</p>
      </div>
    );
  }

  if (list.status === "loading") {
    return (
      <div className={wrapClass}>
        {counts ? tabBar : <FavoriteChipRowSkeleton />}
        <FavoriteGridSkeleton />
      </div>
    );
  }

  if (list.status === "error") {
    return (
      <div className={wrapClass}>
        {counts ? tabBar : null}
        <MyStateView kind="error" error={{ message: t("ui_fav_load_failed"), onRetry: () => void reload() }} />
      </div>
    );
  }

  const browseCta = (
    <Link href="/market" className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}>
      {t("mypage_r5_trade_browse")}
    </Link>
  );

  if (tab === "all" && list.items.length === 0 && !list.nextCursor) {
    return (
      <div className={wrapClass}>
        <MyStateView
          kind="empty"
          empty={{
            icon: <Heart className="h-6 w-6" aria-hidden />,
            title: t("ui_fav_empty_title"),
            body: t("ui_fav_empty_hint"),
            cta: browseCta,
          }}
        />
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {tabBar}
      {list.items.length === 0 && !list.nextCursor ? (
        <MyStateView kind="empty" empty={{ title: emptyTabMsg[tab] }} />
      ) : (
        <>
          <ul className={`m-0 min-w-0 w-full list-none p-0 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}>
            {list.items.map((post) => (
              <li key={post.id} className="min-w-0">
                <FavoritePostCard post={post} onUnfavorite={() => handleUnfavorited(post)} />
              </li>
            ))}
          </ul>
          <MyListPager
            hasMore={Boolean(list.nextCursor)}
            loading={list.loadingMore}
            error={list.loadMoreError}
            onLoadMore={list.loadMore}
          />
        </>
      )}
    </div>
  );
}

const BONE = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";

/** 칩행 4개 회색 pill (최종 설계 S22 스켈레톤) */
function FavoriteChipRowSkeleton() {
  return (
    <div className="mb-3 flex gap-2" aria-hidden data-testid="fav-chip-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-8 w-16 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

/** 그리드 카드 6개(정사각 사진 + 가격·제목 2줄) */
function FavoriteGridSkeleton() {
  return (
    <ul
      aria-busy="true"
      data-testid="fav-grid-skeleton"
      className={`m-0 min-w-0 w-full list-none p-0 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex min-w-0 flex-col gap-2">
          <span className={`block aspect-square w-full ${BONE}`} />
          <span className={`block h-4 w-[45%] ${BONE}`} />
          <span className={`block h-3.5 w-[80%] ${BONE}`} />
        </li>
      ))}
    </ul>
  );
}
