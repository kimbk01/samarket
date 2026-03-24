"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { CommunityCommentDTO, CommunityPostDetailDTO } from "@/lib/community-feed/types";
import { formatTimeAgo } from "@/lib/utils/format";
import { startCommunityInquiryToAuthor } from "@/lib/chat/startCommunityInquiry";
import { createCommunityFeedPostReport } from "@/lib/reports/createCommunityFeedPostReport";
import { useRouter } from "next/navigation";

export function CommunityPostDetailClient({
  post,
  initialComments,
}: {
  post: CommunityPostDetailDTO;
  initialComments: CommunityCommentDTO[];
}) {
  const router = useRouter();
  const me = getCurrentUser();
  const [comments, setComments] = useState(initialComments);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [inquiryErr, setInquiryErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportErr, setReportErr] = useState("");

  useEffect(() => {
    void fetch(`/api/community/posts/${post.id}/view`, { method: "POST" });
  }, [post.id]);

  const onLike = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${post.id}/like`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; like_count?: number };
      if (data.ok && typeof data.like_count === "number") setLikeCount(data.like_count);
    } finally {
      setBusy(false);
    }
  };

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/community/posts/${post.id}/comments`, { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean; comments?: CommunityCommentDTO[] };
    if (data.ok && data.comments) setComments(data.comments);
  }, [post.id]);

  useRefetchOnPageShowRestore(() => void refreshComments());

  const onSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = commentText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: t }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        setCommentText("");
        await refreshComments();
      }
    } finally {
      setBusy(false);
    }
  };

  const onReport = async () => {
    setReportErr("");
    setBusy(true);
    try {
      const res = await createCommunityFeedPostReport(post.id, reportText);
      if (res.ok) {
        setReportOpen(false);
        setReportText("");
      } else setReportErr(res.error);
    } finally {
      setBusy(false);
    }
  };

  const onInquiry = async () => {
    if (!post.author_id || !me?.id) {
      router.push("/login");
      return;
    }
    setInquiryErr("");
    const res = await startCommunityInquiryToAuthor(post.id, post.author_id);
    if (res.ok) router.push(`/chats/${res.roomId}`);
    else setInquiryErr(res.error);
  };

  const time =
    post.created_at && !Number.isNaN(Date.parse(post.created_at))
      ? formatTimeAgo(post.created_at, "ko-KR")
      : "";

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <TradePrimaryColumnStickyAppBar
        title="동네생활"
        backButtonProps={{ backHref: "/community", ariaLabel: "피드로" }}
      />

      <article className={`w-full min-w-0 pb-4 pt-[9px] ${APP_MAIN_GUTTER_X_CLASS}`}>
        <div className="rounded-none border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-none px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: post.topic_color ?? "#64748b" }}
            >
              {post.topic_name}
            </span>
            {post.is_question ? (
              <span className="rounded-none bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">질문</span>
            ) : null}
          </div>
          <h1 className="mt-3 text-xl font-bold text-gray-900">{post.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-500">
            <span>{post.author_name}</span>
            {post.region_label ? <span>{post.region_label}</span> : null}
            <span>{time}</span>
            <span>조회 {post.view_count}</span>
            <span>댓글 {comments.length}</span>
          </div>
          <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">{post.content}</div>
          {post.images.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {post.images.map((im) =>
                im.url ? (
                  <a key={im.id} href={im.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-none bg-gray-100">
                    { }
                    <img src={im.url} alt="" className="h-40 w-full object-cover" />
                  </a>
                ) : null
              )}
            </div>
          ) : null}

          {post.is_meetup && (post.meetup_date || post.meetup_place) ? (
            <div className="mt-4 rounded-none bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
              {post.meetup_date ? <p>일시: {new Date(post.meetup_date).toLocaleString("ko-KR")}</p> : null}
              {post.meetup_place ? <p>장소: {post.meetup_place}</p> : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onLike()}
              className="rounded-none border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-800"
            >
              공감 {likeCount}
            </button>
            {me?.id && me.id !== post.author_id ? (
              <button
                type="button"
                onClick={() => void onInquiry()}
                className="rounded-none bg-violet-600 px-4 py-2 text-[13px] font-medium text-white"
              >
                작성자에게 문의
              </button>
            ) : null}
            {me?.id && me.id !== post.author_id ? (
              <button
                type="button"
                onClick={() => {
                  setReportErr("");
                  setReportOpen(true);
                }}
                className="rounded-none border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-medium text-red-800"
              >
                신고
              </button>
            ) : null}
            <Link href="/community" className="rounded-none border border-gray-200 px-4 py-2 text-[13px] text-gray-600">
              목록
            </Link>
          </div>
          {inquiryErr ? <p className="mt-2 text-[12px] text-red-600">{inquiryErr}</p> : null}
        </div>

        {reportOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog">
            <div className="w-full max-w-md rounded-none bg-white p-4 shadow-xl">
              <p className="text-[15px] font-semibold text-gray-900">게시글 신고</p>
              <p className="mt-1 text-[12px] text-gray-500">신고 사유를 적어 주세요. 운영팀이 확인합니다.</p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                className="mt-3 w-full rounded-none border border-gray-200 px-3 py-2 text-[14px]"
                placeholder="예: 스팸, 욕설, 사기 의심 등"
              />
              {reportErr ? <p className="mt-1 text-[12px] text-red-600">{reportErr}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="flex-1 rounded-none border border-gray-200 py-2.5 text-[14px] text-gray-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={busy || !reportText.trim()}
                  onClick={() => void onReport()}
                  className="flex-1 rounded-none bg-gray-900 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
                >
                  접수
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="mt-4 rounded-none border border-gray-100 bg-white p-4 shadow-sm" id="comments">
          <h2 className="text-[15px] font-semibold text-gray-900">댓글 {comments.length}</h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {comments.map((c) => (
              <li key={c.id} className="py-3">
                <p className="text-[12px] font-medium text-gray-600">{c.author_name}</p>
                <p className="mt-1 text-[14px] text-gray-800">{c.content}</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {c.created_at && !Number.isNaN(Date.parse(c.created_at))
                    ? formatTimeAgo(c.created_at, "ko-KR")
                    : ""}
                </p>
              </li>
            ))}
          </ul>

          <form onSubmit={onSubmitComment} className="mt-4 border-t border-gray-100 pt-4">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={me?.id ? "댓글을 입력하세요" : "로그인 후 댓글을 작성할 수 있어요"}
              disabled={!me?.id || busy}
              rows={3}
              className="w-full rounded-none border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-gray-400"
            />
            <button
              type="submit"
              disabled={!me?.id || busy || !commentText.trim()}
              className="mt-2 w-full rounded-none bg-gray-900 py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              등록
            </button>
          </form>
        </section>
      </article>
    </div>
  );
}
