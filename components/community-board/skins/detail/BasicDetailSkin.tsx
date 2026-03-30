"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BoardDetailSkinProps } from "@/lib/community-board/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { startCommunityInquiryToAuthor } from "@/lib/chat/startCommunityInquiry";
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
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquiryErr, setInquiryErr] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const me = getCurrentUser()?.id ?? "";
  const authorId = post.author?.id ?? "";
  const showAuthorInquiry = !!authorId && me && me !== authorId;

  const onInquiry = async () => {
    if (!authorId) return;
    const u = getCurrentUser();
    if (!u?.id) {
      router.push("/login");
      return;
    }
    setInquiryErr("");
    setInquiryBusy(true);
    const res = await startCommunityInquiryToAuthor(post.id, authorId);
    setInquiryBusy(false);
    if (res.ok) router.push(`/chats/${res.roomId}`);
    else setInquiryErr(res.error);
  };

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
    <article className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-2">
          {post.community_topic?.name ? (
            <span className="shrink-0 rounded bg-sky-50 px-2 py-0.5 text-[12px] font-medium text-sky-800">
              {post.community_topic.name}
            </span>
          ) : null}
          <h1 className="min-w-0 flex-1 text-xl font-semibold text-gray-900">{post.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500">
          {post.author?.name && <span>{post.author.name}</span>}
          <span>{new Date(post.created_at).toLocaleString("ko-KR")}</span>
          {post.view_count > 0 && <span>조회 {post.view_count}</span>}
          {showAuthorInquiry && (
            <button
              type="button"
              disabled={inquiryBusy}
              onClick={() => void onInquiry()}
              className="ml-auto rounded-lg border border-gray-200 bg-signature/5 px-2.5 py-1 text-[13px] font-medium text-gray-900 disabled:opacity-50"
            >
              {inquiryBusy ? "연결 중…" : "작성자에게 문의"}
            </button>
          )}
        </div>
        {inquiryErr ? <p className="mt-2 text-xs text-red-600">{inquiryErr}</p> : null}
        <div className="mt-4 prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
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
      <footer className="px-4 py-3 border-t border-gray-100 flex gap-2">
        {showLike && (
          <button type="button" className="text-sm text-gray-600 hover:text-gray-900">
            좋아요
          </button>
        )}
        {showComments && (
          <a
            href="#community-post-comments"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            댓글
          </a>
        )}
        {showReport && (
          <button
            type="button"
            disabled={reportBusy}
            onClick={() => void onReport()}
            className="ml-auto text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
          >
            {reportBusy ? "처리 중…" : "신고"}
          </button>
        )}
      </footer>
    </article>
  );
}
