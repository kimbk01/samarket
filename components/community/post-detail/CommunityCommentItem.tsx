"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreVertical, ThumbsUp } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { communityAuthorNameText } from "@/lib/community/community-display-fallbacks";
import { formatAppNumber } from "@/lib/i18n/locale-for-app-language";
import { formatTimeAgo } from "@/lib/utils/format";
import { COMMUNITY_COMMENT_MAX_DEPTH } from "@/lib/community/community-comment-limits";
import {
  CM_AUTHOR_NAME_CLASS,
  CM_BTN_GHOST_CLASS,
  CM_BTN_PILL_PRIMARY_CLASS,
  CM_COMMENT_BODY_CLASS,
  CM_META_CLASS,
  CM_TEXTAREA_CLASS,
} from "@/lib/community/community-ui-classes";

/**
 * 라운지 댓글 한 줄 — 표시는 서버 `display_state` 만 본다 (설계 §6.2 · 감사 L2: 본문 글자로 상태를 추측하지 않음).
 * 행 메뉴(⋮)는 목록이 여는 공용 하단 시트 하나 (`CommunityCommentSection` · 감사 L18).
 */
type Props = {
  node: NeighborhoodCommentNode;
  depth?: number;
  /** 바로 위 댓글 작성자 이름 — 답글 앞 「@이름」 */
  parentAuthorName?: string;
  viewerUserId?: string | null;
  /** 2초 배경 강조할 댓글 (알림·링크로 연 댓글 · 설계 §6.5 「댓글로 이동」) */
  highlightCommentId?: string | null;
  /** 이 id 들의 조상은 답글을 펼친다 (작성 직후·링크로 연 댓글) */
  revealCommentId?: string | null;
  replyTargetId?: string | null;
  onLike: (commentId: string) => void | Promise<void>;
  /** 실패 시 오류 문구, 성공 시 null */
  onEdit: (commentId: string, content: string) => Promise<string | null>;
  onOpenMenu: (node: NeighborhoodCommentNode, authorLabel: string) => void;
  onReply: (node: NeighborhoodCommentNode, authorLabel: string) => void;
  editingCommentId: string | null;
  onEditingChange: (id: string | null) => void;
  maxLength: number | null;
  commentBusy: boolean;
};

const INDENT_PX = 12;
const MAX_VISUAL_DEPTH = 2;
const HIT =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 -my-1.5";

const PLACEHOLDER_KEY: Record<Exclude<NeighborhoodCommentNode["display_state"], "visible">, MessageKey> = {
  deleted_by_author: "community_comment_state_deleted_by_author",
  removed_by_admin: "community_comment_state_removed",
  blocked_author: "community_comment_state_blocked",
  unavailable: "community_comment_state_unavailable",
};

function treeHasId(node: NeighborhoodCommentNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => treeHasId(c, id));
}

export function CommunityCommentItem({
  node,
  depth = 0,
  parentAuthorName = "",
  viewerUserId = null,
  highlightCommentId = null,
  revealCommentId = null,
  replyTargetId = null,
  onLike,
  onEdit,
  onOpenMenu,
  onReply,
  editingCommentId,
  onEditingChange,
  maxLength,
  commentBusy,
}: Props) {
  const { t, language } = useI18n();
  const editing = editingCommentId === node.id;
  const [draft, setDraft] = useState(node.content);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  /** 자리 표시 댓글은 본문이 없으니 답글을 펼쳐 둔다(시안 S1) — 정상 댓글은 「답글 N개 보기」로 접힘 */
  const [repliesOpen, setRepliesOpen] = useState(
    () => node.children.length === 0 || node.display_state !== "visible"
  );
  const me = viewerUserId?.trim() ?? "";
  const isVisible = node.display_state === "visible";
  /** 서버가 빈 이름을 주면 화면 언어 「익명」 */
  const authorLabel = isVisible ? communityAuthorNameText(node.author_name, t) : "";
  const timeRel = useMemo(() => {
    if (!node.created_at || Number.isNaN(Date.parse(node.created_at))) return "";
    return formatTimeAgo(node.created_at, language);
  }, [node.created_at, language]);

  useEffect(() => {
    if (!revealCommentId || revealCommentId === node.id) return;
    if (treeHasId(node, revealCommentId)) setRepliesOpen(true);
  }, [revealCommentId, node]);

  useEffect(() => {
    if (editing) {
      setDraft(node.content);
      setEditError("");
    }
    // 편집을 시작할 때만 본문으로 초기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const onSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    setEditError("");
    try {
      const error = await onEdit(node.id, trimmed);
      if (error) {
        /** 실패하면 편집창과 입력을 유지하고 사유를 보여 준다 (CM-R-05) */
        setEditError(error);
        return;
      }
      onEditingChange(null);
    } finally {
      setSaving(false);
    }
  }, [draft, node.id, onEdit, onEditingChange]);

  const childCount = node.children.length;
  const indent = Math.min(depth, MAX_VISUAL_DEPTH) * INDENT_PX;
  const highlighted = highlightCommentId === node.id;
  const isReplyTarget = replyTargetId === node.id;
  const canReply = Boolean(me) && isVisible && depth < COMMUNITY_COMMENT_MAX_DEPTH;
  const overLimit = maxLength != null && draft.trim().length > maxLength;

  return (
    <article
      id={`comment-${node.id}`}
      data-comment-state={node.display_state}
      className={`min-w-0 scroll-mt-24 py-3 transition-colors duration-700 ${
        highlighted || isReplyTarget ? "bg-[var(--cm-primary-soft)]" : ""
      }`}
      style={{ marginLeft: indent }}
    >
      {node.is_pinned && isVisible && depth === 0 ? (
        <p className="m-0 mb-1 text-[12px] font-bold text-[var(--cm-primary)]">📌 {t("community_comment_pinned_label")}</p>
      ) : null}
      <div className="flex min-w-0 gap-2.5">
        {isVisible ? (
          <SamarketThumbnail
            src={node.author_avatar_url}
            size={32}
            roundedClassName="rounded-full"
            className="mt-0.5 shrink-0 bg-[var(--cm-primary-soft)]"
            fallbackSrc=""
            fallbackNode={
              <span className="text-[13px] font-semibold text-[var(--cm-primary)]" aria-hidden>
                {(authorLabel || "?").slice(0, 1).toUpperCase()}
              </span>
            }
          />
        ) : (
          <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[var(--cm-page-bg)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {isVisible ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <p className={`m-0 min-w-0 truncate ${CM_AUTHOR_NAME_CLASS}`}>{authorLabel}</p>
              {node.is_post_author ? (
                <span className="shrink-0 rounded-ui-rect bg-[var(--cm-primary-soft)] px-1.5 py-px text-[11px] font-semibold text-[var(--cm-primary)]">
                  {t("community_comment_author_badge")}
                </span>
              ) : null}
              <time className={`shrink-0 tabular-nums ${CM_META_CLASS}`} dateTime={node.created_at}>
                {timeRel}
                {node.is_edited ? ` · ${t("community_comment_edit_mark")}` : ""}
              </time>
              <span className="min-w-0 flex-1" />
              <button
                type="button"
                className={`${HIT} text-[var(--cm-text-muted)] hover:bg-[var(--cm-primary-soft)]`}
                aria-label={t("community_comment_more_aria")}
                onClick={() => onOpenMenu(node, authorLabel)}
              >
                <MoreVertical className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>
          ) : null}

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className={CM_TEXTAREA_CLASS}
              />
              {maxLength != null && draft.trim().length >= Math.floor(maxLength * 0.8) ? (
                <p className={`m-0 text-right text-[11px] ${overLimit ? "text-[var(--cm-danger)]" : "text-[var(--cm-text-muted)]"}`}>
                  {t("community_comment_char_count", { count: draft.trim().length, max: maxLength })}
                </p>
              ) : null}
              {editError ? (
                <p className="m-0 text-[12px] font-medium text-[var(--cm-danger)]" role="alert">
                  {editError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !draft.trim() || overLimit}
                  onClick={() => void onSave()}
                  className={`min-h-11 px-4 ${CM_BTN_PILL_PRIMARY_CLASS}`}
                >
                  {t("community_save")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onEditingChange(null)}
                  className={`min-h-11 px-4 ${CM_BTN_GHOST_CLASS}`}
                >
                  {t("common_cancel")}
                </button>
              </div>
            </div>
          ) : isVisible ? (
            <p data-user-content="" className={`mt-1 break-words [overflow-wrap:anywhere] ${CM_COMMENT_BODY_CLASS}`}>
              {depth > 0 && parentAuthorName ? (
                <span className="font-semibold text-[var(--cm-primary)]">@{parentAuthorName} </span>
              ) : null}
              {node.content}
            </p>
          ) : (
            <p className={`m-0 mt-1.5 ${CM_COMMENT_BODY_CLASS} text-[var(--cm-text-muted)]`}>
              {t(PLACEHOLDER_KEY[node.display_state as keyof typeof PLACEHOLDER_KEY])}
            </p>
          )}

          {isVisible && !editing ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              <button
                type="button"
                className={`${HIT} gap-1 font-semibold ${
                  node.liked_by_viewer ? "text-[var(--cm-primary)]" : "text-[var(--cm-text-secondary)]"
                } hover:bg-[var(--cm-primary-soft)]`}
                aria-pressed={node.liked_by_viewer}
                onClick={() => void onLike(node.id)}
              >
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.7} fill={node.liked_by_viewer ? "currentColor" : "none"} />
                {node.like_count > 0
                  ? t("community_stat_likes", { count: formatAppNumber(node.like_count, language) })
                  : t("community_comment_like")}
              </button>
              {canReply ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  className={`${HIT} px-2.5 font-semibold ${
                    isReplyTarget ? "text-[var(--cm-primary)]" : "text-[var(--cm-text-secondary)]"
                  } hover:bg-[var(--cm-primary-soft)]`}
                  onClick={() => onReply(node, authorLabel)}
                >
                  {t("community_comment_reply")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {childCount > 0 ? (
        <div className="mt-1 min-w-0">
          {!repliesOpen ? (
            <button
              type="button"
              className="ml-[42px] inline-flex min-h-11 items-center border-0 bg-transparent px-0 text-left text-[13px] font-semibold text-[var(--cm-primary)]"
              onClick={() => setRepliesOpen(true)}
            >
              {t("community_replies_expand", { count: childCount })}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="mb-1 ml-[42px] inline-flex min-h-11 items-center border-0 bg-transparent px-0 text-left text-[12px] text-[var(--cm-text-muted)]"
                onClick={() => setRepliesOpen(false)}
              >
                {t("community_replies_collapse")}
              </button>
              <ul className="m-0 list-none space-y-0 divide-y divide-[var(--cm-border)] pl-0">
                {node.children.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <CommunityCommentItem
                      node={c}
                      depth={depth + 1}
                      parentAuthorName={authorLabel}
                      viewerUserId={viewerUserId}
                      highlightCommentId={highlightCommentId}
                      revealCommentId={revealCommentId}
                      replyTargetId={replyTargetId}
                      onLike={onLike}
                      onEdit={onEdit}
                      onOpenMenu={onOpenMenu}
                      onReply={onReply}
                      editingCommentId={editingCommentId}
                      onEditingChange={onEditingChange}
                      maxLength={maxLength}
                      commentBusy={commentBusy}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function isOwnComment(node: NeighborhoodCommentNode, viewerUserId: string | null | undefined): boolean {
  const me = viewerUserId?.trim() ?? "";
  return me.length > 0 && node.display_state === "visible" && isSameUserId(node.user_id, me);
}
