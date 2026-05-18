"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Pencil, ThumbsUp, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { isSameUserId } from "@/lib/auth/same-user-id";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { formatTimeAgo } from "@/lib/utils/format";
import { ReplyLGlyph } from "./CommunityCommentComposerForm";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  PHILIFE_FB_INPUT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

function formatCommentStamp(iso: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}.${m}.${day} ${h}:${min}:${s}`;
}

type Props = {
  node: NeighborhoodCommentNode;
  depth?: number;
  viewerUserId?: string | null;
  viewerIsAdmin?: boolean;
  onLike: (commentId: string) => void | Promise<void>;
  onEdit: (commentId: string, content: string) => void | Promise<void>;
  onDelete: (commentId: string) => void | Promise<void>;
  /** 한 번에 한 댓글만 답글 입력 열림 */
  replyOpenCommentId: string | null;
  onReplyOpenChange: (id: string | null) => void;
  onSubmitReply: (parentId: string, content: string) => void | Promise<void>;
  commentBusy: boolean;
};

const INDENT_PX = 14;
const MAX_VISUAL_DEPTH = 8;

export function CommunityCommentItem({
  node,
  depth = 0,
  viewerUserId = null,
  viewerIsAdmin = false,
  onLike,
  onEdit,
  onDelete,
  replyOpenCommentId,
  onReplyOpenChange,
  onSubmitReply,
  commentBusy,
}: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.content);
  const [saving, setSaving] = useState(false);
  /** 단계별: 답글이 있으면 처음엔 접어 두기 */
  const [repliesOpen, setRepliesOpen] = useState(() => node.children.length === 0);
  const [replyDraft, setReplyDraft] = useState("");
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

  const timeRel = useMemo(() => {
    if (!node.created_at || Number.isNaN(Date.parse(node.created_at))) return "";
    return formatTimeAgo(node.created_at, "ko-KR");
  }, [node.created_at]);
  const timeStamp = useMemo(() => formatCommentStamp(node.created_at), [node.created_at]);

  useEffect(() => {
    if (!isReplyOpen) setReplyDraft((prev) => (prev === "" ? prev : ""));
  }, [isReplyOpen]);

  useEffect(() => {
    if (!isReplyOpen) return;
    if (typeof document === "undefined") return;
    const el = document.getElementById(`comment-${node.id}`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
  }, [isReplyOpen, node.id]);

  const onSave = useCallback(async () => {
    const t = draft.trim();
    if (!t) return;
    setSaving((prev) => (prev ? prev : true));
    try {
      await onEdit(node.id, t);
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
  }, [node.id, pathname]);

  const childCount = node.children.length;
  const showRepliesFold = childCount > 0;
  const indent = Math.min(depth, MAX_VISUAL_DEPTH) * INDENT_PX;

  const toggleReply = () => {
    if (isReplyOpen) {
      onReplyOpenChange(null);
    } else {
      onReplyOpenChange(node.id);
    }
  };

  const submitInlineReply = async () => {
    const t = replyDraft.trim();
    if (!t || commentBusy) return;
    await onSubmitReply(node.id, t);
    onReplyOpenChange(null);
    setReplyDraft("");
    if (typeof document !== "undefined") {
      const el = document.getElementById(`comment-${node.id}`);
      if (el) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          el.scrollIntoView();
        }
      }
    }
  };

  return (
    <article
      id={`comment-${node.id}`}
      className="scroll-mt-24 border-b border-[#E5E7EB] pb-3"
      style={{ marginLeft: indent }}
    >
      <div className="flex gap-1.5">
        {depth > 0 ? <ReplyLGlyph /> : <span className="inline-block w-7 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="m-0 min-w-0 break-words text-[14px] font-semibold text-[#1F2430]">{node.author_name}</p>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <time className="text-[12px] tabular-nums font-normal text-[#6B7280]" dateTime={node.created_at}>
                {timeStamp || timeRel}
                {node.is_edited ? <span className="text-[#9CA3AF]">{t("community_comment_edit_mark")}</span> : null}
              </time>
              {isDeleteAllowed && !editing && !isDeleted ? (
                <button
                  type="button"
                  className="rounded-[4px] p-0.5 text-[#E25555] hover:bg-rose-50"
                  aria-label={t("community_comment_delete_aria")}
                  onClick={() => void onDelete(node.id)}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-[4px] p-1 text-[#6B7280] hover:bg-[#F7F8FA]"
                aria-label={t("community_comment_copy_aria")}
                onClick={() => void copyCommentLink()}
              >
                <Link2 className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[14px] font-normal leading-[1.5] text-[#1F2430] placeholder:text-[13px] placeholder:font-normal placeholder:text-[#9CA3AF] outline-none focus:border-[#7360F2] focus:ring-1 focus:ring-[#7360F2]/20"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !draft.trim()}
                  onClick={() => void onSave()}
                  className={COMMUNITY_BUTTON_PRIMARY_CLASS}
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
                  className={COMMUNITY_BUTTON_SECONDARY_CLASS}
                >
                  {t("common_cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`mt-1 break-words text-[14px] font-normal leading-[1.5] ${
                isDeleted ? "text-[#9CA3AF]" : "text-[#1F2430]"
              }`}
            >
              {isDeleted ? deletedLabel : node.content}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-normal text-[#6B7280]">
              <button
                type="button"
                className={`inline-flex items-center gap-0.5 rounded-[4px] px-2 py-0.5 font-semibold ${
                  node.liked_by_viewer ? "text-[#7360F2]" : "hover:bg-[#F7F8FA]"
                }`}
                aria-pressed={node.liked_by_viewer}
                disabled={isDeleted}
                onClick={() => void onLike(node.id)}
              >
                <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.7} fill={node.liked_by_viewer ? "currentColor" : "none"} />
                {t("community_stat_likes", {
                  count: Math.max(0, node.like_count || 0).toLocaleString(),
                })}
              </button>
              {me && !isDeleted ? (
                <button
                  type="button"
                  disabled={commentBusy}
                  className={`rounded-[4px] px-2 py-0.5 font-semibold ${isReplyOpen ? "text-[#7360F2]" : "text-[#1F2430] hover:bg-[#F7F8FA]"}`}
                  onClick={toggleReply}
                >
                  {isReplyOpen ? t("community_reply_cancel") : t("community_reply_write")}
                </button>
              ) : null}
              {isOwner && !editing && !isDeleted ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 rounded-[4px] px-2 py-0.5 hover:bg-[#F7F8FA]"
                  onClick={() => {
                    setDraft(node.content);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {t("common_edit")}
                </button>
              ) : null}
            </div>
            <span className="inline-flex cursor-default items-center gap-0.5 text-[12px] text-[#9CA3AF]" title={t("community_comment_more_prep")}>
              {t("community_comment_actions_ellipsis")}
            </span>
          </div>

          {isReplyOpen && me ? (
            <div className="mt-1.5 rounded-[4px] border border-[#E5E7EB] bg-[#F7F8FA] px-1.5 py-1.5">
              <div className="flex items-center gap-1.5">
              <ReplyLGlyph />
              <input
                type="text"
                className="min-h-[2rem] min-w-0 flex-1 border-0 border-b border-[#D1D5DB] bg-transparent px-1 py-0.5 text-[13px] font-normal leading-[1.2] text-[#1F2430] outline-none ring-0 placeholder:text-[12px] placeholder:text-[#9CA3AF] focus:border-[#7360F2]"
                value={replyDraft}
                disabled={commentBusy}
                onChange={(e) => setReplyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitInlineReply();
                  }
                }}
                placeholder={t("community_reply_placeholder")}
                autoComplete="off"
                enterKeyHint="send"
              />
              </div>
              <div className="mt-1.5 flex items-center justify-end">
              <button
                type="button"
                disabled={commentBusy || !replyDraft.trim()}
                className={`shrink-0 min-h-[2rem] px-3 text-[13px] ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
                onClick={() => void submitInlineReply()}
              >
                {t("community_comment_reply")}
              </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {childCount > 0 ? (
        <div className="mt-2 pl-1">
          {showRepliesFold && !repliesOpen ? (
            <button
              type="button"
              className="m-0 border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-[#7360F2] underline underline-offset-2"
              onClick={() => setRepliesOpen((prev) => (prev ? prev : true))}
            >
              {t("community_replies_expand", { count: childCount })}
            </button>
          ) : (
            <>
              {showRepliesFold && repliesOpen ? (
                <button
                  type="button"
                  className="mb-2 border-0 bg-transparent p-0 text-left text-[12px] text-[#6B7280]"
                  onClick={() => setRepliesOpen((prev) => (prev ? false : prev))}
                >
                  {t("community_replies_collapse")}
                </button>
              ) : null}
              <ul className="m-0 list-none space-y-0 pl-0">
                {node.children.map((c) => (
                  <li key={c.id} className="pt-1">
                    <CommunityCommentItem
                      node={c}
                      depth={depth + 1}
                      viewerUserId={viewerUserId}
                      viewerIsAdmin={viewerIsAdmin}
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
