"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";
import {
  COMMUNITY_TAB_ACTIVE_CLASS,
  COMMUNITY_TAB_IDLE_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { CommunityCommentComposerForm, type MeAvatarProps } from "./CommunityCommentComposerForm";
import { CommunityCommentItem } from "./CommunityCommentItem";

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
  return [...roots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

type Props = {
  roots: NeighborhoodCommentNode[];
  scrollToBottomSignal: number;
  commentsLoading: boolean;
  locked?: boolean;
  lockMessage?: string;
  viewerUserId?: string | null;
  onCommentLike: (commentId: string) => void | Promise<void>;
  onCommentEdit: (commentId: string, content: string) => void | Promise<void>;
  onCommentDelete: (commentId: string) => void | Promise<void>;
  onSubmitReply: (parentId: string, content: string) => void | Promise<void>;
  commentBusy: boolean;
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

const sortTabBase = "rounded-[4px] px-3 py-1.5 text-[13px] font-semibold transition-colors";

export function CommunityCommentSection({
  roots,
  scrollToBottomSignal,
  commentsLoading,
  locked = false,
  lockMessage = "",
  viewerUserId = null,
  onCommentLike,
  onCommentEdit,
  onCommentDelete,
  onSubmitReply,
  commentBusy,
  composer = null,
}: Props) {
  const [sortMode, setSortMode] = useState<CommentSortMode>("thread");
  const [replyOpenCommentId, setReplyOpenCommentId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const displayRoots = useMemo(() => sortRoots(roots, sortMode), [roots, sortMode]);
  const n = useMemo(() => countFlat(roots), [roots]);

  useEffect(() => {
    if (scrollToBottomSignal <= 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollToBottomSignal]);

  if (locked) {
    return (
      <section className="border-t border-[#E5E7EB] bg-[#F7F8FA]" id="comments">
        <div className="px-4 py-4">
          <h2 className="m-0 text-[17px] font-bold leading-[1.35] text-[#1F2430]">댓글</h2>
          <div className="mt-3 flex min-h-[88px] items-center justify-center gap-2 rounded-[4px] border border-[#E5E7EB] bg-white px-4 py-4 text-[14px] text-[#6B7280]">
            <span>{lockMessage || "댓글을 작성할 수 없어요."}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-[#E5E7EB] bg-[#F7F8FA]" id="comments">
      <div className="px-4 py-4">
        <h2 className="m-0 flex items-center gap-2 text-[17px] font-bold leading-[1.35] text-[#1F2430]">
          <MessageCircle className="h-5 w-5 text-[#6B7280]" strokeWidth={1.8} aria-hidden />
          댓글 ({n})
        </h2>
        {composer ? (
          <div
            id="comment-composer"
            className="mt-3 scroll-mt-4 rounded-[4px] border border-[#E5E7EB] bg-white p-3 shadow-[0_1px_2px_rgba(31,36,48,0.05)]"
          >
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
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] font-normal text-[#6B7280]">댓글 목록</p>
          <div
            className="flex gap-1 rounded-[4px] border border-[#E5E7EB] bg-white p-0.5"
            role="group"
            aria-label="댓글 정렬"
          >
            <button
              type="button"
              className={
                sortMode === "thread"
                  ? `${sortTabBase} ${COMMUNITY_TAB_ACTIVE_CLASS}`
                  : `${sortTabBase} ${COMMUNITY_TAB_IDLE_CLASS}`
              }
              onClick={() => setSortMode((prev) => (prev === "thread" ? prev : "thread"))}
            >
              등록순
            </button>
            <button
              type="button"
              className={
                sortMode === "newest"
                  ? `${sortTabBase} ${COMMUNITY_TAB_ACTIVE_CLASS}`
                  : `${sortTabBase} ${COMMUNITY_TAB_IDLE_CLASS}`
              }
              onClick={() => setSortMode((prev) => (prev === "newest" ? prev : "newest"))}
            >
              최신순
            </button>
          </div>
        </div>

        {commentsLoading ? (
          <div className="py-8 text-center text-[14px] text-[#6B7280]">댓글 불러오는 중…</div>
        ) : displayRoots.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-[#9CA3AF]">첫 댓글을 남겨 보세요.</p>
        ) : (
          <ul className="m-0 mt-3 list-none rounded-[4px] border border-[#E5E7EB] bg-white p-2 shadow-[0_1px_2px_rgba(31,36,48,0.05)] [&>li:last-child>article]:border-b-0">
            {displayRoots.map((node) => (
              <li key={node.id} className="m-0 p-0">
                <CommunityCommentItem
                  node={node}
                  viewerUserId={viewerUserId}
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
            <div ref={endRef} />
          </ul>
        )}
      </div>
    </section>
  );
}
