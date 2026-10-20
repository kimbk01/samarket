"use client";

import type {
  CommunityActivityCommentItem,
  CommunityActivityReactionItem,
  CommunityActivityReportItem,
  CommunityReportStatusStage,
} from "@/lib/mypage/community-activity-types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, Heart, MoreVertical } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyListPager, MyStateView } from "@/components/mypage/ds";
import { DibayActionSheet, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_ACTIVITY_HUB_TABS,
  communityReportStatusStage,
  type CommunityActivityHubTabId,
} from "@/lib/mypage/community-activity-types";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast, showMypageUndoToast } from "@/lib/mypage/mypage-toast";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import {
  fetchMypageListJson,
  readMypageListCache,
  useMypageCursorList,
  writeMypageListCache,
  type MypageCursorPage,
} from "@/lib/mypage/use-mypage-cursor-list";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";
import {
  createDeferredCommitQueue,
  deleteCommunityPostReaction,
  type DeferredCommitQueue,
} from "@/lib/mypage/mypage-deferred-commit";
import { Sam } from "@/lib/ui/sam-component-classes";

type AnyItem = CommunityActivityCommentItem | CommunityActivityReactionItem | CommunityActivityReportItem;

/** RSC 첫 페이지(활성 탭만) — 실패는 `ok:false` 로 받아 화면 오류+재시도 */
export type CommunityActivityInitial =
  | { ok: true; tab: CommunityActivityHubTabId; items: AnyItem[]; next_cursor: string | null }
  | { ok: false; tab: CommunityActivityHubTabId };

const REPORT_STAGE_KEY: Record<CommunityReportStatusStage, MessageKey> = {
  received: "mypage_r5_activity_report_status_received",
  reviewing: "mypage_r5_activity_report_status_reviewing",
  resolved: "mypage_r5_activity_report_status_resolved",
  rejected: "mypage_r5_activity_report_status_rejected",
};

const REPORT_STAGE_CLASS: Record<CommunityReportStatusStage, string> = {
  received: "bg-sam-surface-muted text-sam-muted",
  reviewing: "bg-sam-warning-soft text-sam-fg",
  resolved: "bg-sam-success-soft text-sam-success",
  rejected: "bg-sam-danger-soft text-sam-danger",
};

export function communityActivityTabUrl(tab: CommunityActivityHubTabId, cursor: string | null): string {
  const qs = new URLSearchParams({ tab, limit: String(MYPAGE_LIST_PAGE_DEFAULT) });
  if (cursor) qs.set("cursor", cursor);
  return `/api/me/community-activity?${qs}`;
}

function cacheKeyFor(viewerId: string, tab: CommunityActivityHubTabId) {
  return `mypage:community-activity:${viewerId}:${tab}`;
}

function itemKey(tab: CommunityActivityHubTabId, it: AnyItem): string {
  if (tab === "reactions" || tab === "saved") return (it as CommunityActivityReactionItem).postId;
  return it.id;
}

function postHref(postId: string, visible: boolean): string | null {
  if (!postId || !visible) return null;
  return `/philife/${encodeURIComponent(postId)}`;
}

function RowShell({ href, children, trailing }: { href: string | null; children: ReactNode; trailing?: ReactNode }) {
  const inner = <span className="flex min-w-0 flex-1 flex-col gap-1">{children}</span>;
  return (
    <div className="flex min-h-[4.5rem] items-start gap-2 px-4 py-3 md:px-5">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 active:bg-sam-pressed-surface">
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1" aria-disabled="true">
          {inner}
        </div>
      )}
      {trailing}
    </div>
  );
}

/**
 * 댓글·반응 (최종 설계 S27) — 탭 [댓글 · 좋아요 · 저장 · 신고] `?tab=` → 탭별 행 → 더 보기.
 * - 댓글 ⋯ → [삭제] 확인 시트 → 기존 DELETE(A7).
 * - 좋아요/저장 [해제] → 확인 없이 즉시 제거 + [되돌리기] 5초 → 지연 커밋 DELETE(A6, keepalive). 동시 대기 1건.
 * - 신고 = 대상 · 사유 · 처리 상태 뱃지. 오류는 빈 목록이 아니라 오류+재시도.
 */
export function CommunityActivityHubView({
  viewerId,
  initial,
}: {
  viewerId: string;
  initial: CommunityActivityInitial;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useMypageTabParam<CommunityActivityHubTabId>({
    values: COMMUNITY_ACTIVITY_HUB_TABS,
    defaultValue: "comments",
  });
  const [seeded] = useState(() => {
    if (initial.ok && !readMypageListCache(cacheKeyFor(viewerId, initial.tab))) {
      writeMypageListCache(cacheKeyFor(viewerId, initial.tab), {
        items: initial.items,
        nextCursor: initial.next_cursor,
        pages: 1,
      });
    }
    return true;
  });
  const [commentMenu, setCommentMenu] = useState<CommunityActivityCommentItem | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<MypageCursorPage<AnyItem>> => {
      const d = await fetchMypageListJson<{ ok?: boolean; items?: AnyItem[]; next_cursor?: string | null }>(
        communityActivityTabUrl(tab, cursor)
      );
      if (!d.ok) throw new Error("activity_fetch_failed");
      return { items: Array.isArray(d.items) ? d.items : [], next_cursor: d.next_cursor ?? null };
    },
    [tab]
  );
  const list = useMypageCursorList<AnyItem>({
    cacheKey: seeded ? cacheKeyFor(viewerId, tab) : null,
    fetchPage,
    getId: (it) => itemKey(tab, it),
  });
  const { reload, setItems } = list;
  useMypageListRestore({ ready: list.status === "ready", loadedPages: list.pages });

  /** 지연 커밋 큐 — 화면 이탈(언마운트)·pagehide 시 즉시 커밋 */
  const queueRef = useRef<DeferredCommitQueue | null>(null);
  if (queueRef.current == null) queueRef.current = createDeferredCommitQueue();
  useEffect(() => {
    const q = queueRef.current!;
    const onHide = () => q.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      q.flush();
    };
  }, []);
  /** 탭 전환 시에도 대기 건 커밋(다른 탭 캐시와 어긋나지 않게) */
  useEffect(() => {
    queueRef.current?.flush();
  }, [tab]);

  const labels = useMemo(
    () => ({
      comments: t("mypage_comp_activity_hub_tab_comments"),
      reactions: t("mypage_comp_activity_hub_tab_reactions"),
      saved: t("mypage_comp_activity_hub_tab_saved"),
      reports: t("mypage_comp_activity_hub_tab_reports"),
    }),
    [t]
  );

  const releaseReaction = useCallback(
    (row: CommunityActivityReactionItem, kind: "like" | "save") => {
      const index = list.items.findIndex((x) => itemKey(tab, x) === row.postId);
      const key = `${kind}:${row.postId}`;
      const listKey = cacheKeyFor(viewerId, tab);
      const restore = () => {
        // 다른 탭으로 옮겼으면 그 탭 캐시에 복원
        const cached = readMypageListCache<AnyItem>(listKey);
        if (cached && !cached.items.some((x) => (x as CommunityActivityReactionItem).postId === row.postId)) {
          const next = [...cached.items];
          next.splice(Math.min(Math.max(0, index), next.length), 0, row);
          writeMypageListCache(listKey, { items: next, nextCursor: cached.nextCursor, pages: cached.pages });
        }
        setItems((prev) => {
          if (prev.some((x) => (x as CommunityActivityReactionItem).postId === row.postId)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(0, index), next.length), 0, row);
          return next;
        });
      };
      setItems((prev) => prev.filter((x) => (x as CommunityActivityReactionItem).postId !== row.postId));
      queueRef.current!.schedule({
        key,
        commit: () => deleteCommunityPostReaction(row.postId, kind),
        onFail: () => {
          restore();
          showMypageToast(t("mypage_r5_activity_release_failed"), "error");
        },
      });
      showMypageUndoToast(
        t(kind === "like" ? "mypage_r5_activity_unliked" : "mypage_r5_activity_unsaved"),
        () => {
          if (queueRef.current!.cancel(key)) restore();
        },
        t("mypage_comp_ds_undo")
      );
    },
    [list.items, setItems, t, tab, viewerId]
  );

  const deleteComment = useCallback(
    async (row: CommunityActivityCommentItem) => {
      const ok = await dibayConfirm({
        title: t("mypage_r5_activity_comment_delete_title"),
        description: t("mypage_r5_activity_comment_delete_body"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_delete"),
        confirmTone: "destructive",
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/community/posts/${encodeURIComponent(row.postId)}/comments/${encodeURIComponent(row.id)}`,
          { method: "DELETE", credentials: "include" }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || json.ok === false) {
          showMypageToast(t("mypage_r5_activity_comment_delete_failed"), "error");
          return;
        }
        setItems((prev) => prev.filter((x) => x.id !== row.id));
        showMypageToast(t("mypage_r5_activity_comment_deleted"));
      } catch {
        showMypageToast(t("mypage_r5_activity_comment_delete_failed"), "error");
      }
    },
    [setItems, t]
  );

  const emptyKey: Record<CommunityActivityHubTabId, MessageKey> = {
    comments: "mypage_comp_community_comments_empty",
    reactions: "mypage_comp_activity_hub_reactions_empty",
    saved: "mypage_comp_activity_hub_saved_empty",
    reports: "mypage_comp_community_reports_empty",
  };

  const renderRow = (it: AnyItem): ReactNode => {
    if (tab === "comments") {
      const row = it as CommunityActivityCommentItem;
      const visible = row.postVisible !== false && Boolean(row.postTitle);
      return (
        <RowShell
          href={postHref(row.postId, visible)}
          trailing={
            <button
              type="button"
              onClick={() => setCommentMenu(row)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
              aria-label={t("mypage_comp_more_aria")}
              aria-haspopup="dialog"
              data-testid="activity-comment-more"
            >
              <MoreVertical className="h-[18px] w-[18px]" aria-hidden />
            </button>
          }
        >
          <span className="line-clamp-1 sam-text-helper font-medium text-sam-muted">
            {visible ? row.postTitle : t("mypage_r5_activity_post_unavailable")}
          </span>
          <span className="line-clamp-2 sam-text-body text-sam-fg">{row.content || "—"}</span>
          <span className="sam-text-helper text-sam-meta">{formatMypageDate(row.createdAt, { style: "datetime" })}</span>
        </RowShell>
      );
    }
    if (tab === "reactions" || tab === "saved") {
      const row = it as CommunityActivityReactionItem;
      const visible = row.postVisible !== false && Boolean(row.title);
      const kind = tab === "reactions" ? "like" : "save";
      return (
        <RowShell
          href={postHref(row.postId, visible)}
          trailing={
            <button
              type="button"
              onClick={() => releaseReaction(row, kind)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sam-icon-surface text-sam-primary"
              aria-label={t(kind === "like" ? "mypage_r5_activity_unlike_aria" : "mypage_r5_activity_unsave_aria")}
              data-testid={`activity-release-${kind}`}
            >
              {kind === "like" ? (
                <Heart className="h-[18px] w-[18px]" fill="currentColor" aria-hidden />
              ) : (
                <Bookmark className="h-[18px] w-[18px]" fill="currentColor" aria-hidden />
              )}
            </button>
          }
        >
          <span className="line-clamp-2 sam-text-body font-medium text-sam-fg">
            {visible ? row.title : t("mypage_r5_activity_post_unavailable")}
          </span>
          <span className="sam-text-helper text-sam-meta">{formatMypageDate(row.createdAt, { style: "datetime" })}</span>
        </RowShell>
      );
    }
    const row = it as CommunityActivityReportItem;
    const stage = communityReportStatusStage(row.status);
    const fallbackTitle =
      row.channel === "messenger"
        ? t("mypage_activity_report_messenger")
        : row.targetType === "comment"
          ? t("mypage_activity_report_comment")
          : t("mypage_activity_report_community");
    return (
      <RowShell href={null}>
        <span className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 sam-text-body text-sam-fg">{row.title || fallbackTitle}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${REPORT_STAGE_CLASS[stage]}`}
            data-report-stage={stage}
          >
            {t(REPORT_STAGE_KEY[stage])}
          </span>
        </span>
        <span className="sam-text-helper text-sam-meta">
          {row.reasonType} · {formatMypageDate(row.createdAt, { style: "datetime" })}
        </span>
      </RowShell>
    );
  };

  let body: ReactNode;
  if (list.status === "loading") {
    body = <ActivitySkeleton tab={tab} />;
  } else if (list.status === "error") {
    body = (
      <MyStateView
        kind="error"
        error={{ message: t("mypage_r5_activity_load_failed"), onRetry: () => void reload() }}
      />
    );
  } else if (list.items.length === 0) {
    body = <MyStateView kind="empty" empty={{ title: t(emptyKey[tab]) }} />;
  } else {
    body = (
      <>
        <ul className="m-0 list-none overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-0">
          {list.items.map((it) => (
            <li key={itemKey(tab, it)} className="border-t border-sam-border-soft first:border-t-0">
              {renderRow(it)}
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
    <div className="flex min-w-0 flex-col gap-2">
      <div className={`${Sam.tabs.bar} mb-1 grid grid-cols-4`} role="tablist">
        {COMMUNITY_ACTIVITY_HUB_TABS.map((id) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`${selected ? Sam.tabs.tabActive : Sam.tabs.tab} min-h-12 min-w-0 truncate`}
              onClick={() => setTab(id)}
              data-testid={`activity-tab-${id}`}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>
      {body}
      <DibayActionSheet
        open={commentMenu != null}
        onClose={() => setCommentMenu(null)}
        items={
          commentMenu
            ? [
                {
                  key: "delete",
                  label: t("common_delete"),
                  danger: true,
                  onClick: () => {
                    const target = commentMenu;
                    if (target) void deleteComment(target);
                  },
                },
              ]
            : []
        }
        cancelLabel={t("common_cancel")}
      />
    </div>
  );
}

/** 스켈레톤 — 행 6개(댓글 탭: 소제목 1줄 + 본문 2줄 / 그 외 1줄 + 우측 아이콘 원) */
export function ActivitySkeleton({ tab }: { tab: CommunityActivityHubTabId }) {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul
      aria-busy="true"
      data-testid="activity-skeleton"
      className="m-0 list-none overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface p-0"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-t border-sam-border-soft px-4 py-3 first:border-t-0 md:px-5">
          {tab === "comments" ? (
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={`h-3 w-[40%] ${bone}`} />
              <span className={`h-3.5 w-[90%] ${bone}`} />
              <span className={`h-3.5 w-[70%] ${bone}`} />
            </span>
          ) : (
            <>
              <span className="flex min-w-0 flex-1">
                <span className={`h-3.5 w-[70%] ${bone}`} />
              </span>
              <span className="h-11 w-11 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
