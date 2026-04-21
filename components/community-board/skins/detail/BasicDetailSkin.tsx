"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BoardDetailSkinProps } from "@/lib/community-board/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createCommunityPostReport } from "@/lib/reports/createCommunityPostReport";

export function BasicDetailSkin({
  post,
  board: _board,
  boardSlug: _boardSlug,
  showComments = true,
  showLike = true,
  showReport = true,
}: BoardDetailSkinProps) {
  const router = useRouter();
  const [reportBusy, setReportBusy] = useState(false);
  const me = getCurrentUser()?.id ?? "";
  const authorId = post.author?.id ?? "";

  const onReport = async () => {
    const u = getCurrentUser();
    if (!u?.id) {
      router.push("/login");
      return;
    }
    const reason = window.prompt("신고 사유를 짧게 입력해 주세요.");
    if (reason == null) return;
    const text = reason.trim();
    if (!text) return;
    setReportBusy(true);
    const res = await createCommunityPostReport(post.id, text);
    setReportBusy(false);
    if (res.ok) alert("신고가 접수되었습니다.");
    else alert(res.error);
  };

  return (
    <article className="bg-sam-surface rounded-ui-rect border border-sam-border overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          {post.community_topic?.name ? (
            <span className="shrink-0 rounded bg-sky-50 px-2 py-0.5 sam-text-helper font-medium text-sky-800">
              {post.community_topic.name}
            </span>
          ) : null}
          <h1 className="min-w-0 flex-1 text-xl font-semibold text-sam-fg">{post.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-sam-muted">
          {post.author?.name && <span>{post.author.name}</span>}
          <span>{new Date(post.created_at).toLocaleString("ko-KR")}</span>
          {post.view_count > 0 && <span>조회 {post.view_count}</span>}
        </div>
        <div className="mt-4 prose prose-sm max-w-none text-sam-fg whitespace-pre-wrap">
          {post.content}
        </div>
        {post.images && post.images.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.images.map((img) =>
              img.url ? (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  className="max-h-64 rounded object-cover"
                />
              ) : null
            )}
          </div>
        )}
      </div>
      <footer className="px-4 py-3 border-t border-sam-border-soft flex gap-2">
        {showLike && (
          <button type="button" className="text-sm text-sam-muted hover:text-sam-fg">
            좋아요
          </button>
        )}
        {showComments && (
          <a
            href="#community-post-comments"
            className="text-sm text-sam-muted hover:text-sam-fg"
          >
            댓글
          </a>
        )}
        {showReport && (
          <button
            type="button"
            disabled={reportBusy}
            onClick={() => void onReport()}
            className="ml-auto text-sm text-sam-muted hover:text-red-600 disabled:opacity-50"
          >
            {reportBusy ? "처리 중…" : "신고"}
          </button>
        )}
      </footer>
    </article>
  );
}
