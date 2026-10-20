"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MessageCircle, MoreVertical, PenSquare, ThumbsUp } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import type { OwnCommunityPostDTO, OwnCommunityPostStatus } from "@/lib/community-feed/list-community-posts-for-user";
import { philifeNeighborhoodPostUrl } from "@/lib/philife/api";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import {
  fetchMypageListJson,
  readMypageListCache,
  useMypageCursorList,
  writeMypageListCache,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import { DIBAY_STATUS_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";

export const OWN_COMMUNITY_POST_TABS = ["active", "hidden"] as const satisfies readonly OwnCommunityPostStatus[];

/** RSC 첫 페이지(게시중 또는 URL 탭) — 실패는 `ok:false` 로 받아 화면 오류+재시도 */
export type OwnCommunityPostsInitial =
  | { ok: true; status: OwnCommunityPostStatus; posts: OwnCommunityPostDTO[]; next_cursor: string | null; total?: number }
  | { ok: false; status: OwnCommunityPostStatus };

type PageResponse = { ok?: boolean; posts?: OwnCommunityPostDTO[]; next_cursor?: string | null; total?: number };

export function ownCommunityPostsUrl(status: OwnCommunityPostStatus, cursor: string | null, limit = MYPAGE_LIST_PAGE_DEFAULT) {
  const qs = new URLSearchParams({ scope: "own", status, limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  return `/api/me/community-posts?${qs}`;
}

function cacheKeyFor(viewerId: string, status: OwnCommunityPostStatus) {
  return `mypage:community-posts:${viewerId}:${status}`;
}

/** 수정 항목 노출 — 가져온 글·모임 글은 숨김(PATCH 거부 조건과 동일) */
export function canEditOwnCommunityPost(p: Pick<OwnCommunityPostDTO, "isImported" | "is_meetup">): boolean {
  return !p.isImported && !p.is_meetup;
}
/** 삭제 항목 노출 — 가져온 글은 숨김(DELETE 거부 조건과 동일) */
export function canDeleteOwnCommunityPost(p: Pick<OwnCommunityPostDTO, "isImported">): boolean {
  return !p.isImported;
}

/**
 * 내가 쓴 글 (최종 설계 S26) — 탭 [게시중 · 숨김됨](개수) `?tab=active|hidden` → 글 행(제목·주제·댓글·좋아요·날짜 + ⋯)
 * → 더 보기. ⋯ = [수정] `/philife/write?edit=` · [삭제] 확인 시트 → DELETE. 오류는 빈 목록이 아니라 오류+재시도.
 */
export function MypageCommunityPostsList({
  viewerId,
  initial,
}: {
  viewerId: string;
  initial: OwnCommunityPostsInitial;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useMypageTabParam<OwnCommunityPostStatus>({
    values: OWN_COMMUNITY_POST_TABS,
    defaultValue: "active",
  });
  const [totals, setTotals] = useState<Record<OwnCommunityPostStatus, number | null>>(() => ({
    active: initial.ok && initial.status === "active" ? (initial.total ?? null) : null,
    hidden: initial.ok && initial.status === "hidden" ? (initial.total ?? null) : null,
  }));
  /** RSC 첫 페이지를 캐시에 심어 첫 페인트에 바로 그림(클라이언트 재요청 없음) */
  const [seeded] = useState(() => {
    if (initial.ok && !readMypageListCache(cacheKeyFor(viewerId, initial.status))) {
      writeMypageListCache(cacheKeyFor(viewerId, initial.status), {
        items: initial.posts,
        nextCursor: initial.next_cursor,
        pages: 1,
      });
    }
    return true;
  });
  const [menuFor, setMenuFor] = useState<OwnCommunityPostDTO | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<OwnCommunityPostDTO>> => {
      const d = await fetchMypageListJson<PageResponse>(ownCommunityPostsUrl(tab, cursor));
      if (!d.ok) throw new Error("community_posts_load_failed");
      if (typeof d.total === "number") {
        const n = d.total;
        setTotals((prev) => (prev[tab] === n ? prev : { ...prev, [tab]: n }));
      }
      return { items: Array.isArray(d.posts) ? d.posts : [], next_cursor: d.next_cursor ?? null };
    },
    [tab]
  );
  const list = useMypageCursorList<OwnCommunityPostDTO>({
    cacheKey: seeded ? cacheKeyFor(viewerId, tab) : null,
    fetchPage,
    getId: (p) => p.id,
  });
  const { reload, setItems } = list;
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });
  useRefetchOnPageShowRestore(() => void reload());

  /** 다른 탭 개수만 — `limit=1` 첫 페이지 `total` */
  const other: OwnCommunityPostStatus = tab === "active" ? "hidden" : "active";
  const otherKnown = totals[other] != null;
  useEffect(() => {
    if (otherKnown) return;
    let cancelled = false;
    void runSingleFlight(`mypage:community-posts:count:${viewerId}:${other}`, () =>
      fetchMypageListJson<PageResponse>(ownCommunityPostsUrl(other, null, 1))
    )
      .then((d) => {
        if (!cancelled && typeof d.total === "number") {
          const n = d.total;
          setTotals((prev) => ({ ...prev, [other]: n }));
        }
      })
      .catch(() => undefined); // 개수 칸만 비움
    return () => {
      cancelled = true;
    };
  }, [other, otherKnown, viewerId]);

  const deletePost = useCallback(
    async (post: OwnCommunityPostDTO) => {
      const ok = await dibayConfirm({
        title: t("mypage_r5_cposts_delete_confirm_title"),
        description: t("mypage_r5_cposts_delete_confirm_body"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_delete"),
        confirmTone: "destructive",
      });
      if (!ok) return;
      try {
        const res = await fetch(philifeNeighborhoodPostUrl(post.id), { method: "DELETE", credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || json.ok === false) {
          showMypageToast(t("mypage_r5_cposts_delete_failed"), "error");
          return;
        }
        setItems((prev) => prev.filter((p) => p.id !== post.id));
        setTotals((prev) => ({ ...prev, [tab]: prev[tab] != null ? Math.max(0, (prev[tab] as number) - 1) : null }));
        invalidateMypageSummary();
        showMypageToast(t("mypage_r5_cposts_deleted"));
      } catch {
        showMypageToast(t("mypage_r5_cposts_delete_failed"), "error");
      }
    },
    [setItems, t, tab]
  );

  const menuItems: DibayActionSheetItem[] = [];
  if (menuFor && canEditOwnCommunityPost(menuFor)) {
    const id = menuFor.id;
    menuItems.push({
      key: "edit",
      label: t("mypage_r5_cposts_edit"),
      onClick: () => router.push(`/philife/write?edit=${encodeURIComponent(id)}`),
    });
  }
  if (menuFor && canDeleteOwnCommunityPost(menuFor)) {
    const target = menuFor;
    menuItems.push({ key: "delete", label: t("common_delete"), danger: true, onClick: () => void deletePost(target) });
  }

  const labels: Record<OwnCommunityPostStatus, string> = {
    active: t("mypage_r5_cposts_tab_active"),
    hidden: t("mypage_r5_cposts_tab_hidden"),
  };

  let body: ReactNode;
  if (list.status === "loading") {
    body = <MyCommunityPostsSkeleton />;
  } else if (list.status === "error") {
    body = (
      <MyStateView kind="error" error={{ message: t("mypage_r5_cposts_load_failed"), onRetry: () => void reload() }} />
    );
  } else if (list.items.length === 0) {
    body =
      tab === "active" ? (
        <MyStateView
          kind="empty"
          empty={{
            icon: <PenSquare className="h-6 w-6" aria-hidden />,
            title: t("mypage_r5_cposts_empty_active"),
            cta: (
              <Link
                href="/philife/write"
                className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} inline-flex items-center justify-center`}
              >
                {t("mypage_r5_cposts_write")}
              </Link>
            ),
          }}
        />
      ) : (
        <MyStateView kind="empty" empty={{ title: t("mypage_r5_cposts_empty_hidden") }} />
      );
  } else {
    body = (
      <>
        <ul className="m-0 list-none overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-0">
          {list.items.map((p) => (
            <li key={p.id} className="border-t border-sam-border-soft first:border-t-0" data-own-post-id={p.id}>
              <div className="flex items-start gap-2 px-4 py-3 md:px-5">
                <Link
                  href={`/philife/${encodeURIComponent(p.id)}`}
                  className="flex min-w-0 flex-1 items-start gap-3 active:bg-sam-pressed-surface"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block sam-text-body font-semibold text-sam-fg">
                      {p.title || t("mypage_r5_cposts_untitled")}
                    </span>
                    {p.isHiddenForOwner ? (
                      <span className="mt-1 inline-flex rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-semibold text-sam-muted">
                        {t("mypage_r5_cposts_hidden_badge")}
                      </span>
                    ) : null}
                    {p.hiddenReason ? (
                      <span className="mt-0.5 line-clamp-1 block sam-text-helper text-sam-muted">{p.hiddenReason}</span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 sam-text-helper text-sam-meta">
                      {p.topic_name ? <span>{p.topic_name}</span> : null}
                      <span className="inline-flex items-center gap-0.5">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                        {p.comment_count}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                        {p.like_count}
                      </span>
                      <span>{formatMypageDate(p.created_at)}</span>
                    </span>
                  </span>
                  {p.thumbnail_url ? (
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                      <SamarketThumbnail src={p.thumbnail_url} fill roundedClassName="rounded-ui-rect" />
                    </span>
                  ) : null}
                </Link>
                {canEditOwnCommunityPost(p) || canDeleteOwnCommunityPost(p) ? (
                  <button
                    type="button"
                    onClick={() => setMenuFor(p)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
                    aria-label={t("mypage_comp_more_aria")}
                    aria-haspopup="dialog"
                    data-testid="own-post-more"
                  >
                    <MoreVertical className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                ) : null}
              </div>
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
    );
  }

  return (
    <div className="flex flex-col">
      <div className={`${DIBAY_STATUS_TABS_CLASS} mb-3`} data-dibay-nav="status" role="tablist">
        {OWN_COMMUNITY_POST_TABS.map((id) => {
          const n = totals[id];
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={dibaySecondaryTabClass(active)}
            >
              {labels[id]}
              {n != null ? <span className="ml-1 opacity-80">({n})</span> : null}
            </button>
          );
        })}
      </div>
      {body}
      <DibayActionSheet
        open={menuFor != null}
        onClose={() => setMenuFor(null)}
        items={menuItems}
        cancelLabel={t("common_cancel")}
      />
    </div>
  );
}

/** 스켈레톤 — 행 6개(제목 1줄 70% + 메타 1줄 + 우측 56 사각) */
export function MyCommunityPostsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul
      aria-busy="true"
      data-testid="own-posts-skeleton"
      className="m-0 list-none overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-0"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-t border-sam-border-soft px-4 py-3 first:border-t-0 md:px-5">
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 w-[70%] ${bone}`} />
            <span className={`h-3 w-[45%] ${bone}`} />
          </span>
          <span className={`h-14 w-14 shrink-0 ${bone}`} />
        </li>
      ))}
    </ul>
  );
}
