"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import { CommunityCommentComposerForm, type MeAvatarProps } from "./CommunityCommentComposerForm";
import { CommunityCommentItem } from "./CommunityCommentItem";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityCard } from "@/components/community/ui/CommunityCard";
import {
  CM_BTN_GHOST_CLASS,
  CM_SEGMENT_ACTIVE_CLASS,
  CM_SEGMENT_IDLE_CLASS,
} from "@/lib/community/community-ui-classes";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";

export type CommentSortMode = "thread" | "newest";

function countFlat(nodes: NeighborhoodCommentNode[]): number {
  let n = 0;
  const walk = (arr: NeighborhoodCommentNode[]) => {
    for (const x of arr) {
      n += 1;
      if (x.children.length) walk(x.children);
    }
  };
  walk(nodes);
  return n;
}

function sortRoots(roots: NeighborhoodCommentNode[], mode: CommentSortMode): NeighborhoodCommentNode[] {
  if (mode === "thread") return roots;
  return [...roots].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

type Props = {
  roots: NeighborhoodCommentNode[];
  focusCommentId?: string | null;
  commentsLoading: boolean;
  commentsLoadError?: boolean;
  onRetryComments?: () => void;
  locked?: boolean;
  lockMessage?: string;
  viewerUserId?: string | null;
  viewerIsAdmin?: boolean;
  onCommentLike: (commentId: string) => void | Promise<void>;
  onCommentEdit: (commentId: string, content: string) => void | Promise<void>;
  onCommentDelete: (commentId: string) => void | Promise<void>;
  onSubmitReply: (parentId: string, content: string) => void | Promise<void>;
  commentBusy: boolean;
  composerError?: string;
  composer: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    busy: boolean;
    disabled: boolean;
    isLoggedIn: boolean;
    placeholder: string;
    me: MeAvatarProps | null;
  } | null;
};

export function CommunityCommentSection({
  roots,
  focusCommentId = null,
  commentsLoading,
  commentsLoadError = false,
  onRetryComments,
  locked = false,
  lockMessage = "",
  viewerUserId = null,
  viewerIsAdmin = false,
  onCommentLike,
  onCommentEdit,
  onCommentDelete,
  onSubmitReply,
  commentBusy,
  composerError = "",
  composer = null,
}: Props) {
  const { t } = useI18n();
  const { effectiveViewportBottom } = useFormKeyboardViewport({ enabled: Boolean(composer) });
  useFormKeyboardFocusVisibility({
    enabled: Boolean(composer),
    effectiveViewportBottom,
  });
  const [sortMode, setSortMode] = useState<CommentSortMode>("thread");
  const [replyOpenCommentId, setReplyOpenCommentId] = useState<string | null>(null);
  const displayRoots = useMemo(() => sortRoots(roots, sortMode), [roots, sortMode]);
  const n = useMemo(() => countFlat(roots), [roots]);

  useEffect(() => {
    if (!focusCommentId) return;
    if (typeof document === "undefined") return;
    const el = document.getElementById(`comment-${focusCommentId}`);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
  }, [focusCommentId]);

  if (locked) {
    return (
      <CommunityCard className="mt-4">
        <h2 className="m-0 text-[17px] font-bold text-[var(--cm-text)]">
          {t("community_comments_title", { count: n })}
        </h2>
        <div className="mt-3 flex min-h-[4rem] items-center justify-center rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-page-bg)] px-4 py-3 text-[14px] text-[var(--cm-text-muted)]">
          {lockMessage || t("community_comment_locked")}
        </div>
      </CommunityCard>
    );
  }

  const listState: "loading" | "error" | "empty" | "success" =
    commentsLoading && displayRoots.length === 0
      ? "loading"
      : commentsLoadError && displayRoots.length === 0
        ? "error"
        : displayRoots.length === 0
          ? "empty"
          : "success";

  return (
    <CommunityCard className="mt-4" id="comments">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 flex min-w-0 items-center gap-2 text-[17px] font-bold text-[var(--cm-text)]">
          <MessageCircle className="h-5 w-5 shrink-0 text-[var(--cm-text-muted)]" strokeWidth={1.8} aria-hidden />
          <span className="min-w-0 break-words">{t("community_comments_title", { count: n })}</span>
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

      {composer ? (
        <div id="comment-composer" className="mt-4 min-w-0 scroll-mt-4">
          <CommunityCommentComposerForm
            me={composer.me}
            value={composer.value}
            onChange={composer.onChange}
            onSubmit={composer.onSubmit}
            busy={composer.busy}
            disabled={composer.disabled}
            isLoggedIn={composer.isLoggedIn}
            placeholder={composer.placeholder}
          />
          {composerError ? (
            <p className="mt-2 text-[12px] font-medium text-[var(--cm-danger)]" role="alert">
              {composerError}
            </p>
          ) : null}
        </div>
      ) : null}

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
                viewerIsAdmin={viewerIsAdmin}
                focusCommentId={focusCommentId}
                onLike={onCommentLike}
                onEdit={onCommentEdit}
                onDelete={onCommentDelete}
                replyOpenCommentId={replyOpenCommentId}
                onReplyOpenChange={setReplyOpenCommentId}
                onSubmitReply={onSubmitReply}
                commentBusy={commentBusy}
              />
            </li>
          ))}
        </ul>
      )}
    </CommunityCard>
  );
}
