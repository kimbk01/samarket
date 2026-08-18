"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, ThumbsUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";
import { formatAppNumber } from "@/lib/i18n/locale-for-app-language";
import { formatTimeAgo } from "@/lib/utils/format";
import {
  CommunityCommentGrowTextarea,
  ReplyLGlyph,
} from "./CommunityCommentComposerForm";
import {
  CM_AUTHOR_NAME_CLASS,
  CM_BTN_GHOST_CLASS,
  CM_BTN_PILL_PRIMARY_CLASS,
  CM_BTN_TEXT_CLASS,
  CM_COMMENT_BODY_CLASS,
  CM_META_CLASS,
  CM_TEXTAREA_CLASS,
} from "@/lib/community/community-ui-classes";

type Props = {
  node: NeighborhoodCommentNode;
  depth?: number;
  viewerUserId?: string | null;
  viewerIsAdmin?: boolean;
  focusCommentId?: string | null;
  onLike: (commentId: string) => void | Promise<void>;
  onEdit: (commentId: string, content: string) => void | Promise<void>;
  onDelete: (commentId: string) => void | Promise<void>;
  replyOpenCommentId: string | null;
  onReplyOpenChange: (id: string | null) => void;
  onSubmitReply: (parentId: string, content: string) => void | Promise<void>;
  commentBusy: boolean;
};

const INDENT_PX = 12;
const MAX_VISUAL_DEPTH = 2;
const HIT =
  "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full px-2 -my-1.5";

function treeHasId(node: NeighborhoodCommentNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => treeHasId(c, id));
}

export function CommunityCommentItem({
  node,
  depth = 0,
  viewerUserId = null,
  viewerIsAdmin = false,
  focusCommentId = null,
  onLike,
  onEdit,
  onDelete,
  replyOpenCommentId,
  onReplyOpenChange,
  onSubmitReply,
  commentBusy,
}: Props) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.content);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(() => node.children.length === 0);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyFocused, setReplyFocused] = useState(false);
  const replyComposingRef = useRef(false);
  const me = viewerUserId?.trim() ?? "";
  const isOwner = me.length > 0 && isSameUserId(node.user_id, me);
  const isDeleteAllowed = isOwner || viewerIsAdmin;
  const deletedLabel = t("community_comment_deleted");
  const normalized = (node.content ?? "").trim();
  const isDeleted =
    normalized === deletedLabel ||
    normalized === "댓글이 삭제 되었습니다." ||
    normalized === "댓글이 삭제 되엇습니다." ||
    normalized === "댓글이 삭제 되었습니다" ||
    normalized === "댓글이 삭제 되엇습니다";
  const isReplyOpen = replyOpenCommentId === node.id;
  const authorLabel = communityAuthorDisplayName(node.author_name, node.author_name);
  const timeRel = useMemo(() => {
    if (!node.created_at || Number.isNaN(Date.parse(node.created_at))) return "";
    return formatTimeAgo(node.created_at, language);
  }, [node.created_at, language]);

  useEffect(() => {
    if (!isReplyOpen) setReplyDraft((prev) => (prev === "" ? prev : ""));
  }, [isReplyOpen]);

  useEffect(() => {
    if (!focusCommentId) return;
    if (focusCommentId === node.id) return;
    if (treeHasId(node, focusCommentId)) setRepliesOpen(true);
  }, [focusCommentId, node]);

  useLayoutEffect(() => {
    if (focusCommentId !== node.id) return;
    if (typeof document === "undefined") return;
    const el = document.getElementById(`comment-${node.id}`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
  }, [focusCommentId, node.id, repliesOpen]);

  const onSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving((prev) => (prev ? prev : true));
    try {
      await onEdit(node.id, trimmed);
      setEditing((prev) => (prev ? false : prev));
    } finally {
      setSaving((prev) => (prev ? false : prev));
    }
  }, [draft, node.id, onEdit]);

  const copyCommentLink = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path = pathname || "";
    const url = `${origin}${path}#comment-${node.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
    setMenuOpen(false);
  }, [node.id, pathname]);

  const childCount = node.children.length;
  const showRepliesFold = childCount > 0;
  const indent = Math.min(depth, MAX_VISUAL_DEPTH) * INDENT_PX;
  const replyExpanded = replyFocused || replyDraft.trim().length > 0;
  const itemClass = `block w-full px-4 py-3 text-left ${CM_BTN_TEXT_CLASS} text-[var(--cm-text)] hover:bg-[var(--cm-page-bg)]`;

  const toggleReply = () => {
    if (isReplyOpen) onReplyOpenChange(null);
    else onReplyOpenChange(node.id);
  };

  const submitInlineReply = async () => {
    const trimmed = replyDraft.trim();
    if (!trimmed || commentBusy || replyComposingRef.current) return;
    await onSubmitReply(node.id, trimmed);
    onReplyOpenChange(null);
    setReplyDraft("");
  };

  return (
    <article id={`comment-${node.id}`} className="min-w-0 scroll-mt-24 py-3" style={{ marginLeft: indent }}>
      <div className="flex min-w-0 gap-1.5">
        {depth > 0 ? <ReplyLGlyph /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className={`m-0 min-w-0 flex-1 ${CM_AUTHOR_NAME_CLASS}`}>{authorLabel}</p>
            <time className={`shrink-0 tabular-nums ${CM_META_CLASS}`} dateTime={node.created_at}>
              {timeRel}
              {node.is_edited ? (
                <span className="text-[var(--cm-text-muted)]">{t("community_comment_edit_mark")}</span>
              ) : null}
            </time>
            <div className="relative shrink-0">
              <button
                type="button"
                className={`${HIT} text-[var(--cm-text-muted)] hover:bg-[var(--cm-primary-soft)]`}
                aria-label={t("community_comment_more_aria")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
              </button>
              {menuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label={t("common_close")}
                    onClick={() => setMenuOpen(false)}
                  />
                  <ul
                    className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-card-bg)] py-1 shadow-[var(--cm-shadow-card)]"
                    role="menu"
                  >
                    <li role="none">
                      <button type="button" role="menuitem" className={itemClass} onClick={() => void copyCommentLink()}>
                        {t("community_comment_copy")}
                      </button>
                    </li>
                    {isOwner && !isDeleted ? (
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className={itemClass}
                          onClick={() => {
                            setDraft(node.content);
                            setEditing(true);
                            setMenuOpen(false);
                          }}
                        >
                          {t("common_edit")}
                        </button>
                      </li>
                    ) : null}
                    {isDeleteAllowed && !isDeleted ? (
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className={`${itemClass} text-[var(--cm-danger)]`}
                          onClick={() => {
                            setMenuOpen(false);
                            void onDelete(node.id);
                          }}
                        >
                          {t("community_delete")}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </>
              ) : null}
            </div>
          </div>

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className={CM_TEXTAREA_CLASS}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !draft.trim()}
                  onClick={() => void onSave()}
                  className={`min-h-12 px-4 ${CM_BTN_PILL_PRIMARY_CLASS}`}
                >
                  {t("community_save")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setDraft(node.content);
                  }}
                  className={`min-h-12 px-4 ${CM_BTN_GHOST_CLASS}`}
                >
                  {t("common_cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`mt-1 break-words [overflow-wrap:anywhere] ${CM_COMMENT_BODY_CLASS} ${
                isDeleted ? "text-[var(--cm-text-muted)]" : ""
              }`}
            >
              {isDeleted ? deletedLabel : node.content}
            </p>
          )}

          {!editing ? (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              <button
                type="button"
                className={`${HIT} gap-1 font-semibold ${
                  node.liked_by_viewer ? "text-[var(--cm-primary)]" : "text-[var(--cm-text-secondary)]"
                } hover:bg-[var(--cm-primary-soft)]`}
                aria-pressed={node.liked_by_viewer}
                disabled={isDeleted}
                onClick={() => void onLike(node.id)}
              >
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.7} fill={node.liked_by_viewer ? "currentColor" : "none"} />
                {t("community_stat_likes", {
                  count: formatAppNumber(Math.max(0, node.like_count || 0), language),
                })}
              </button>
              {me && !isDeleted ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  className={`${HIT} px-2.5 font-semibold ${
                    isReplyOpen ? "text-[var(--cm-primary)]" : "text-[var(--cm-text-secondary)]"
                  } hover:bg-[var(--cm-primary-soft)]`}
                  onClick={toggleReply}
                >
                  {isReplyOpen ? t("community_reply_cancel") : t("community_reply_write")}
                </button>
              ) : null}
            </div>
          ) : null}

          {isReplyOpen && me ? (
            <div className="mt-1.5 min-w-0">
              <p className={`mb-1 ${CM_META_CLASS}`}>{t("community_reply_to", { name: authorLabel })}</p>
              <CommunityCommentGrowTextarea
                value={replyDraft}
                onChange={setReplyDraft}
                placeholder={t("community_reply_placeholder")}
                disabled={commentBusy}
                expanded={replyExpanded}
                composingRef={replyComposingRef}
                onFocus={() => setReplyFocused(true)}
                onBlur={() => setReplyFocused(false)}
              />
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className={`min-h-12 px-4 ${CM_BTN_GHOST_CLASS}`}
                  onClick={() => onReplyOpenChange(null)}
                >
                  {t("common_cancel")}
                </button>
                <button
                  type="button"
                  disabled={commentBusy || !replyDraft.trim()}
                  className={`min-h-12 px-4 ${CM_BTN_PILL_PRIMARY_CLASS}`}
                  onClick={() => void submitInlineReply()}
                >
                  {t("community_comment_post")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {childCount > 0 ? (
        <div className="mt-1 min-w-0">
          {showRepliesFold && !repliesOpen ? (
            <button
              type="button"
              className="inline-flex min-h-12 items-center border-0 bg-transparent px-0 text-left text-[13px] font-semibold text-[var(--cm-primary)] underline underline-offset-2"
              onClick={() => setRepliesOpen(true)}
            >
              {t("community_replies_expand", { count: childCount })}
            </button>
          ) : (
            <>
              {showRepliesFold && repliesOpen ? (
                <button
                  type="button"
                  className="mb-1 inline-flex min-h-12 items-center border-0 bg-transparent px-0 text-left text-[12px] text-[var(--cm-text-muted)]"
                  onClick={() => setRepliesOpen(false)}
                >
                  {t("community_replies_collapse")}
                </button>
              ) : null}
              <ul className="m-0 list-none space-y-0 divide-y divide-[var(--cm-border)] pl-0">
                {node.children.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <CommunityCommentItem
                      node={c}
                      depth={depth + 1}
                      viewerUserId={viewerUserId}
                      viewerIsAdmin={viewerIsAdmin}
                      focusCommentId={focusCommentId}
                      onLike={onLike}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      replyOpenCommentId={replyOpenCommentId}
                      onReplyOpenChange={onReplyOpenChange}
                      onSubmitReply={onSubmitReply}
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
