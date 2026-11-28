"use client";

import { MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { CommunityCommentItem, isOwnComment } from "./CommunityCommentItem";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityCard } from "@/components/community/ui/CommunityCard";
import { DibayActionSheet, type DibayActionSheetItem } from "@/components/ui/dibay-overlay/DibayActionSheet";
import { COMMUNITY_COMMENT_MAX_DEPTH } from "@/lib/community/community-comment-limits";
import { buildCommunityCommentCanonicalUrl } from "@/lib/community/share/community-share-url";
import { scrollElementIntoCenter } from "@/lib/ui/scroll-element-into-center";
import {
  CM_BTN_GHOST_CLASS,
  CM_SEGMENT_ACTIVE_CLASS,
  CM_SEGMENT_IDLE_CLASS,
} from "@/lib/community/community-ui-classes";

export type CommentSortMode = "thread" | "newest";

/** 고정 댓글은 정렬과 상관없이 맨 위 (Owner 결정 1) */
function sortRoots(roots: NeighborhoodCommentNode[], mode: CommentSortMode): NeighborhoodCommentNode[] {
  const pinned = roots.filter((r) => r.is_pinned && r.display_state === "visible");
  const rest = roots.filter((r) => !(r.is_pinned && r.display_state === "visible"));
  const ordered =
    mode === "thread"
      ? rest
      : [...rest].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return [...pinned, ...ordered];
}

function indexDepths(nodes: NeighborhoodCommentNode[], depth = 0, out = new Map<string, number>()) {
  for (const n of nodes) {
    out.set(n.id, depth);
    if (n.children.length) indexDepths(n.children, depth + 1, out);
  }
  return out;
}

type MenuTarget = { node: NeighborhoodCommentNode; authorLabel: string };

type Props = {
  postId: string;
  roots: NeighborhoodCommentNode[];
  /** 「댓글 N」 — 서버 공개 댓글 수(피드 목록 숫자와 같은 정의 · 감사 L4) */
  count: number;
  /** 방금 쓴 댓글 */
  focusCommentId?: string | null;
  /** 알림·링크(`?comment=`)로 연 댓글 */
  deepLinkCommentId?: string | null;
  onDeepLinkHandled?: () => void;
  commentsLoading: boolean;
  commentsLoadError?: boolean;
  onRetryComments?: () => void;
  viewerUserId?: string | null;
  viewerIsAdmin?: boolean;
  viewerIsPostAuthor?: boolean;
  maxLength: number | null;
  replyTargetId: string | null;
  onCommentLike: (commentId: string) => void | Promise<void>;
  onCommentEdit: (commentId: string, content: string) => Promise<string | null>;
  onCommentDelete: (commentId: string) => void | Promise<void>;
  onCommentAdminModerate: (commentId: string, status: "hidden" | "deleted") => void | Promise<void>;
  onCommentPin: (commentId: string, pinned: boolean) => void | Promise<void>;
  onCommentReport: (commentId: string) => void;
  onCommentAuthorBlock: (authorUserId: string, authorLabel: string) => void | Promise<void>;
  onCommentReply: (target: { id: string; name: string }) => void;
  onToast: (message: string) => void;
  /** 댓글 수정 중인가 — 상세 화면이 하단 입력 바를 숨긴다(수정칸 「저장」을 가리지 않게 · 실기 결함 3) */
  onEditingChange?: (editing: boolean) => void;
  commentBusy: boolean;
};

const HIGHLIGHT_MS = 2000;

export function CommunityCommentSection({
  postId,
  roots,
  count,
  focusCommentId = null,
  deepLinkCommentId = null,
  onDeepLinkHandled,
  commentsLoading,
  commentsLoadError = false,
  onRetryComments,
  viewerUserId = null,
  viewerIsAdmin = false,
  viewerIsPostAuthor = false,
  maxLength,
  replyTargetId,
  onCommentLike,
  onCommentEdit,
  onCommentDelete,
  onCommentAdminModerate,
  onCommentPin,
  onCommentReport,
  onCommentAuthorBlock,
  onCommentReply,
  onToast,
  onEditingChange,
  commentBusy,
}: Props) {
  const { t } = useI18n();
  const [sortMode, setSortMode] = useState<CommentSortMode>("thread");
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const displayRoots = useMemo(() => sortRoots(roots, sortMode), [roots, sortMode]);
  const depthById = useMemo(() => indexDepths(roots), [roots]);
  const closeEditing = useCallback(
    (id: string) => setEditingCommentId((cur) => (cur === id ? null : cur)),
    []
  );
  /** 수정 중인 댓글이 목록에서 빠지면(삭제·숨김 뒤 다시 읽기) 수정 상태를 끝낸다 — 입력 바가 영영 숨는 것 방지 */
  const editingVisible = editingCommentId != null && depthById.has(editingCommentId);
  useEffect(() => {
    if (editingCommentId != null && !depthById.has(editingCommentId)) setEditingCommentId(null);
  }, [depthById, editingCommentId]);
  useEffect(() => {
    onEditingChange?.(editingVisible);
  }, [editingVisible, onEditingChange]);
  const me = viewerUserId?.trim() ?? "";
  const revealId = deepLinkCommentId ?? focusCommentId;

  /** 방금 쓴 댓글·링크로 연 댓글 — 조상 답글을 펼친 뒤 가운데로 스크롤 (설계 §6.5). 같은 대상은 한 번만 */
  const handledRevealRef = useRef<string | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    /** 목록을 못 읽었으면 「삭제된 댓글」로 단정하지 않는다 — 재시도 후 다시 판정 */
    if (!revealId || commentsLoading || commentsLoadError) return;
    if (handledRevealRef.current === revealId) return;
    if (typeof document === "undefined") return;
    handledRevealRef.current = revealId;
    const isDeepLink = deepLinkCommentId === revealId;
    if (!depthById.has(revealId)) {
      if (isDeepLink) {
        onToast(t("community_comment_target_missing"));
        if (sectionRef.current) scrollElementIntoCenter(sectionRef.current, { block: "start" });
        onDeepLinkHandled?.();
      }
      return;
    }
    /** 조상 답글 펼침(항목 effect)이 그려진 다음 스크롤 — 한 번만 하므로 다시 그려져도 취소하지 않는다 */
    window.setTimeout(() => {
      const el = document.getElementById(`comment-${revealId}`);
      /** 본문 스크롤 영역만 움직인다 — scrollIntoView 는 문서까지 밀어 머리글·하단 탭이 밀렸다 (실기 결함 2) */
      if (el) scrollElementIntoCenter(el);
      if (isDeepLink) {
        setHighlightId(revealId);
        onDeepLinkHandled?.();
      }
    }, 80);
  }, [commentsLoadError, commentsLoading, deepLinkCommentId, depthById, onDeepLinkHandled, onToast, revealId, t]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const openMenu = useCallback((node: NeighborhoodCommentNode, authorLabel: string) => {
    setMenuTarget({ node, authorLabel });
  }, []);

  const replyTo = useCallback(
    (node: NeighborhoodCommentNode, authorLabel: string) => {
      /** 답글을 시작하면 수정은 끝낸다 — 입력 바가 다시 보여야 답글을 쓸 수 있다 */
      setEditingCommentId(null);
      onCommentReply({ id: node.id, name: authorLabel });
    },
    [onCommentReply]
  );

  const copyLink = useCallback(
    async (commentId: string) => {
      try {
        await navigator.clipboard.writeText(buildCommunityCommentCanonicalUrl(postId, commentId));
        onToast(t("community_comment_link_copied"));
      } catch {
        onToast(t("community_comment_link_copy_failed"));
      }
    },
    [onToast, postId, t]
  );

  /** 행 메뉴 — 순서: 답글·링크 → (글 작성자) 고정 → (본인) 수정·삭제 → (타인) 신고·차단 → (관리자) 숨기기·삭제 (설계 §6.5) */
  const menuItems: DibayActionSheetItem[] = useMemo(() => {
    if (!menuTarget) return [];
    const { node, authorLabel } = menuTarget;
    const depth = depthById.get(node.id) ?? 0;
    const own = isOwnComment(node, me);
    const items: DibayActionSheetItem[] = [];
    if (me && depth < COMMUNITY_COMMENT_MAX_DEPTH) {
      items.push({ key: "reply", label: t("community_comment_reply_action"), onClick: () => replyTo(node, authorLabel) });
    }
    items.push({ key: "copy", label: t("community_comment_copy"), onClick: () => void copyLink(node.id) });
    if (viewerIsPostAuthor && depth === 0) {
      items.push({
        key: "pin",
        label: node.is_pinned ? t("community_comment_unpin") : t("community_comment_pin"),
        onClick: () => void onCommentPin(node.id, !node.is_pinned),
      });
    }
    if (own) {
      items.push({ key: "edit", label: t("common_edit"), onClick: () => setEditingCommentId(node.id) });
      items.push({ key: "delete", label: t("community_delete"), danger: true, onClick: () => void onCommentDelete(node.id) });
      return items;
    }
    if (me) {
      items.push({ key: "report", label: t("community_report"), onClick: () => onCommentReport(node.id) });
    }
    if (viewerIsAdmin) {
      items.push({
        key: "admin-hide",
        label: t("community_comment_admin_hide"),
        danger: true,
        onClick: () => void onCommentAdminModerate(node.id, "hidden"),
      });
      items.push({
        key: "admin-delete",
        label: t("community_comment_admin_delete"),
        danger: true,
        onClick: () => void onCommentAdminModerate(node.id, "deleted"),
      });
    } else if (me && node.user_id) {
      items.push({
        key: "block",
        label: t("community_comment_block_named", { name: authorLabel }),
        danger: true,
        onClick: () => void onCommentAuthorBlock(node.user_id, authorLabel),
      });
    }
    return items;
  }, [
    copyLink,
    depthById,
    me,
    menuTarget,
    onCommentAdminModerate,
    onCommentAuthorBlock,
    onCommentDelete,
    onCommentPin,
    onCommentReport,
    replyTo,
    t,
    viewerIsAdmin,
    viewerIsPostAuthor,
  ]);

  const listState: "loading" | "error" | "empty" | "success" =
    commentsLoading && displayRoots.length === 0
      ? "loading"
      : commentsLoadError && displayRoots.length === 0
        ? "error"
        : displayRoots.length === 0
          ? "empty"
          : "success";

  return (
    <div ref={sectionRef} className="scroll-mt-4">
    <CommunityCard className="mt-4" id="comments">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 flex min-w-0 items-center gap-2 text-[17px] font-bold text-[var(--cm-text)]">
          <MessageCircle className="h-5 w-5 shrink-0 text-[var(--cm-text-muted)]" strokeWidth={1.8} aria-hidden />
          <span className="min-w-0 break-words">
            {/** 불러오는 동안 「댓글 0」을 보이지 않는다 (실기 결함 4) */}
            {(commentsLoading || commentsLoadError) && roots.length === 0
              ? t("community_stat_comments_title")
              : t("community_comments_title", { count })}
          </span>
        </h2>
        <div
          className="inline-flex max-w-full shrink-0 gap-0.5 rounded-full border border-[var(--cm-border)] bg-[var(--cm-page-bg)] p-0.5"
          role="group"
          aria-label={t("community_comments_sort_aria")}
        >
          <button
            type="button"
            className={sortMode === "thread" ? CM_SEGMENT_ACTIVE_CLASS : CM_SEGMENT_IDLE_CLASS}
            onClick={() => setSortMode("thread")}
          >
            {t("community_comment_sort_registered")}
          </button>
          <button
            type="button"
            className={sortMode === "newest" ? CM_SEGMENT_ACTIVE_CLASS : CM_SEGMENT_IDLE_CLASS}
            onClick={() => setSortMode("newest")}
          >
            {t("community_comment_sort_latest")}
          </button>
        </div>
      </div>

      {listState === "loading" ? (
        <div className="py-6 text-center text-[14px] text-[var(--cm-text-muted)]">
          {t("community_comments_loading")}
        </div>
      ) : listState === "error" ? (
        <div className="py-6 text-center">
          <p className="m-0 text-[14px] text-[var(--cm-text)]">{t("community_comments_load_error")}</p>
          {onRetryComments ? (
            <button
              type="button"
              className={`mt-3 min-h-12 px-4 ${CM_BTN_GHOST_CLASS}`}
              onClick={() => onRetryComments()}
            >
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      ) : listState === "empty" ? (
        <p className="py-6 text-center text-[14px] text-[var(--cm-text-muted)]">{t("community_comment_first")}</p>
      ) : (
        <ul className="m-0 mt-3 list-none divide-y divide-[var(--cm-border)] p-0">
          {displayRoots.map((node) => (
            <li key={node.id} className="m-0 min-w-0">
              <CommunityCommentItem
                node={node}
                viewerUserId={viewerUserId}
                highlightCommentId={highlightId}
                revealCommentId={revealId}
                replyTargetId={replyTargetId}
                onLike={onCommentLike}
                onEdit={onCommentEdit}
                onOpenMenu={openMenu}
                onReply={replyTo}
                editingCommentId={editingCommentId}
                onEditingChange={setEditingCommentId}
                onEditingClose={closeEditing}
                maxLength={maxLength}
                commentBusy={commentBusy}
              />
            </li>
          ))}
        </ul>
      )}

      <DibayActionSheet
        open={menuTarget != null}
        onClose={() => setMenuTarget(null)}
        cancelLabel={t("common_cancel")}
        items={menuItems}
      />
    </CommunityCard>
    </div>
  );
}
