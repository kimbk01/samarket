"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { History, ImageOff, MoreVertical } from "lucide-react";
import { PostCard } from "@/components/post/PostCard";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { MessageKey } from "@/lib/i18n/messages";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";
import { TRADE_FEED_PRODUCT_GRID_CLASS } from "@/lib/posts/trade-feed-layout-classes";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyGroup, MyStateView } from "@/components/mypage/ds";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  MYPAGE_RECENCY_BUCKETS,
  mypageRecencyBucket,
  type MypageRecencyBucket,
} from "@/lib/mypage/format-mypage-date";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import {
  fetchMypageListJson,
  useMypageCursorList,
  type MypageCursorListState,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

type RecentViewPost = PostWithMeta & { viewed_at: string };
type RecentViewDeleted = { postId: string; viewedAt: string; deleted: true };
export type RecentViewEntry = RecentViewPost | RecentViewDeleted;

export function isDeletedRecentView(e: RecentViewEntry): e is RecentViewDeleted {
  return (e as RecentViewDeleted).deleted === true;
}
function entryPostId(e: RecentViewEntry): string {
  return isDeletedRecentView(e) ? e.postId : String(e.id);
}
function entryViewedAt(e: RecentViewEntry): string {
  return isDeletedRecentView(e) ? e.viewedAt : e.viewed_at;
}

const BUCKET_LABEL_KEY: Record<MypageRecencyBucket, MessageKey> = {
  today: "mypage_r5_recent_bucket_today",
  yesterday: "mypage_r5_recent_bucket_yesterday",
  this_week: "mypage_r5_recent_bucket_this_week",
  earlier: "mypage_r5_recent_bucket_earlier",
};

/** 날짜 묶음(오늘·어제·이번 주·이전, PHT) — 순서 유지 */
export function groupRecentViewsByBucket(
  items: readonly RecentViewEntry[],
  now: number = Date.now()
): { bucket: MypageRecencyBucket; items: RecentViewEntry[] }[] {
  const map = new Map<MypageRecencyBucket, RecentViewEntry[]>();
  for (const it of items) {
    const b = mypageRecencyBucket(entryViewedAt(it), now);
    const arr = map.get(b) ?? [];
    arr.push(it);
    map.set(b, arr);
  }
  return MYPAGE_RECENCY_BUCKETS.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
}

/**
 * 최근 본 상품 화면 (최종 설계 S25 · M3) — 헤더 오른쪽 [전체 삭제](확인 시트) → 날짜 묶음 → 상품 카드(⋯ 삭제)
 * → 삭제된 글은 회색 「삭제된 상품」 행(⋯ 삭제만, 탭 비활성). 최대 100개·90일(커서 없음).
 */
export function RecentViewedScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const viewer = getCurrentUser()?.id ?? "session";
  const [confirmClear, setConfirmClear] = useState(false);
  const { run, pending } = useMypageSubmitGuard();

  const fetchPage = useCallback(async (): Promise<MypageCursorPage<RecentViewEntry>> => {
    const json = await fetchMypageListJson<{ ok?: boolean; items?: RecentViewEntry[] }>("/api/me/recent-views");
    if (!json.ok) throw new Error("recent_views_load_failed");
    return { items: Array.isArray(json.items) ? json.items : [], next_cursor: null };
  }, []);
  const list = useMypageCursorList<RecentViewEntry>({
    cacheKey: `mypage:recent-views:${viewer}`,
    fetchPage,
    getId: entryPostId,
  });
  const { setItems } = list;
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  const remove = useCallback(
    async (postId?: string) => {
      const qs = postId ? `?postId=${encodeURIComponent(postId)}` : "";
      try {
        const res = await fetch(`/api/me/recent-views${qs}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error("delete_failed");
        setItems((prev) => (postId ? prev.filter((p) => entryPostId(p) !== postId) : []));
        if (!postId) showMypageToast(t("mypage_r5_recent_cleared"));
      } catch {
        showMypageToast(t("ui_recent_delete_failed"), "error");
      }
    },
    [setItems, t]
  );

  const canClear = list.status === "ready" && list.items.length > 0;
  const clearButton = canClear ? (
    <button
      type="button"
      onClick={() => setConfirmClear(true)}
      disabled={pending}
      className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} ${Sam.focusRing} text-sam-danger`}
      data-testid="recent-clear-all"
    >
      {t("ui_recent_clear_all")}
    </button>
  ) : undefined;
  const confirmSheet = (
    <MobileConfirmBottomSheet
      open={confirmClear}
      onCancel={() => setConfirmClear(false)}
      title={t("mypage_r5_recent_clear_confirm_title")}
      description={t("mypage_r5_recent_clear_confirm_body")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("ui_recent_clear_all")}
      confirmTone="danger"
      onConfirm={() => {
        setConfirmClear(false);
        void run(() => remove());
      }}
    />
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-2" data-my-screen-template="list">
        {clearButton ? <div className="flex justify-end">{clearButton}</div> : null}
        <RecentViewedBody list={list} onRemove={(id) => void remove(id)} />
        {confirmSheet}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app" data-my-screen-template="list">
      <MySubpageHeader
        title={t("route_recent_viewed_title")}
        subtitle={t("route_recent_viewed_subtitle")}
        backHref="/mypage"
        hideCtaStrip
        rightSlot={clearButton}
      />
      <div className={MYPAGE_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} pb-4 pt-2`}>
          <RecentViewedBody list={list} onRemove={(id) => void remove(id)} />
        </div>
      </div>
      {confirmSheet}
    </div>
  );
}

/** 기존 export 호환 — 본문만(헤더 없는 임베드, 레거시 내정보 거래 탭) */
export function RecentViewedList() {
  return <RecentViewedScreen embedded />;
}

function RecentViewedBody({
  list,
  onRemove,
}: {
  list: MypageCursorListState<RecentViewEntry>;
  onRemove: (postId: string) => void;
}) {
  const { t } = useI18n();
  const { propsForCategoryId } = useTradeListCompositionMap();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const groups = useMemo(() => groupRecentViewsByBucket(list.items), [list.items]);

  if (list.unauthorized) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="recent-guest">
        <p className="sam-text-body text-sam-muted">{t("mypage_r5_recent_guest")}</p>
        <Link
          href={`/mypage/account?next=${encodeURIComponent("/mypage/recent-viewed")}`}
          className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}
        >
          {t("common_login")}
        </Link>
      </div>
    );
  }
  if (list.status === "loading") return <RecentViewedSkeleton />;
  if (list.status === "error") {
    return (
      <MyStateView kind="error" error={{ message: t("ui_recent_load_failed"), onRetry: () => void list.reload() }} />
    );
  }
  if (list.items.length === 0) {
    return (
      <MyStateView
        kind="empty"
        empty={{
          icon: <History className="h-6 w-6" aria-hidden />,
          title: t("ui_recent_empty"),
          cta: (
            <Link href="/market" className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}>
              {t("mypage_r5_trade_browse")}
            </Link>
          ),
        }}
      />
    );
  }

  const moreButton = (postId: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuFor(postId);
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
      aria-label={t("mypage_comp_more_aria")}
      aria-haspopup="dialog"
      data-testid="recent-row-more"
    >
      <MoreVertical className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <MyGroup key={g.bucket} title={t(BUCKET_LABEL_KEY[g.bucket])}>
          <ul
            className={`m-0 min-w-0 w-full list-none px-3 pb-3 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}
            data-recent-bucket={g.bucket}
          >
            {g.items.map((entry) => {
              if (isDeletedRecentView(entry)) {
                return (
                  <li
                    key={entry.postId}
                    className="flex min-w-0 flex-col gap-2 opacity-80"
                    data-recent-deleted=""
                  >
                    <div className="flex aspect-square w-full items-center justify-center rounded-ui-rect bg-sam-surface-muted text-sam-meta">
                      <ImageOff className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="sam-text-body-secondary text-sam-meta">{t("mypage_r5_recent_deleted")}</span>
                      {moreButton(entry.postId)}
                    </div>
                  </li>
                );
              }
              const composition = propsForCategoryId(entry.category_id);
              return (
                <li key={entry.id} className="min-w-0">
                  <PostCard
                    post={entry}
                    skinKey={composition?.skinKey}
                    categorySlug={composition?.categorySlug}
                    fieldComposition={composition?.fieldComposition}
                    footer={<div className="flex justify-end px-1 pt-1">{moreButton(String(entry.id))}</div>}
                  />
                </li>
              );
            })}
          </ul>
        </MyGroup>
      ))}
      <DibayActionSheet
        open={menuFor != null}
        onClose={() => setMenuFor(null)}
        items={[
          {
            key: "delete",
            label: t("ui_recent_delete_one"),
            danger: true,
            onClick: () => {
              if (menuFor) onRemove(menuFor);
            },
          },
        ]}
        cancelLabel={t("common_cancel")}
      />
    </div>
  );
}

/** 스켈레톤 — 묶음 제목 바 1 + 그리드 카드 6 */
function RecentViewedSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="recent-skeleton" className="flex flex-col gap-3">
      <span className={`block h-4 w-20 ${bone}`} />
      <ul className={`m-0 min-w-0 w-full list-none p-0 ${TRADE_FEED_PRODUCT_GRID_CLASS}`}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex min-w-0 flex-col gap-2">
            <span className={`block aspect-square w-full ${bone}`} />
            <span className={`block h-4 w-[45%] ${bone}`} />
            <span className={`block h-3.5 w-[80%] ${bone}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
