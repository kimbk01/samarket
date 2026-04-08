"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MeetingFeedPostDTO } from "@/lib/neighborhood/types";
import { MeetingReportModal } from "@/components/meetings/MeetingReportModal";
import { formatKorDateTime } from "@/lib/ui/format-meeting-date";

const POST_TYPE_LABELS: Record<string, string> = {
  notice: "공지",
  intro: "자기소개",
  attendance: "참석",
  review: "후기",
  normal: "",
};

const WRITABLE_TYPES: { value: MeetingFeedPostDTO["post_type"]; label: string }[] = [
  { value: "normal", label: "일반" },
  { value: "intro", label: "자기소개" },
  { value: "attendance", label: "참석" },
  { value: "review", label: "후기" },
];

const HOST_TYPES: { value: MeetingFeedPostDTO["post_type"]; label: string }[] = [
  ...WRITABLE_TYPES,
  { value: "notice", label: "공지" },
];

function formatTime(iso: string | null | undefined): string {
  return formatKorDateTime(iso);
}

interface MeetingFeedTabProps {
  feedPosts: MeetingFeedPostDTO[];
  meetingId: string;
  currentUserId?: string;
  /** 운영 권한(모임장·공동운영자) */
  isHost?: boolean;
  /** false면 일반 멤버는 글 작성 불가 — API와 동일 */
  allowFeed?: boolean;
}

export function MeetingFeedTab({
  feedPosts,
  meetingId,
  currentUserId,
  isHost,
  allowFeed = true,
}: MeetingFeedTabProps) {
  const { tt } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canWrite = Boolean(isHost) || allowFeed !== false;

  const [localPosts, setLocalPosts] = useState<MeetingFeedPostDTO[]>(feedPosts);
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<MeetingFeedPostDTO["post_type"]>("normal");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 30초 주기 자동 폴링 (탭이 보일 때만)
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/philife/meetings/${meetingId}/feed`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { ok: boolean; posts?: MeetingFeedPostDTO[] };
        if (j.ok && Array.isArray(j.posts) && j.posts.length > 0) {
          setLocalPosts(j.posts);
        }
      } catch {
        // 무시
      }
    };
    const timer = setInterval(() => { void poll(); }, 30_000);
    return () => clearInterval(timer);
  }, [meetingId]);

  const visible = localPosts.filter((p) => !p.is_hidden);
  const sorted = [...visible].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    const ta = Number.isNaN(Date.parse(a.created_at)) ? 0 : Date.parse(a.created_at);
    const tb = Number.isNaN(Date.parse(b.created_at)) ? 0 : Date.parse(b.created_at);
    return tb - ta;
  });

  const typeOptions = isHost ? HOST_TYPES : WRITABLE_TYPES;

  const handleDelete = async (postId: string) => {
    if (!confirm(tt("이 글을 삭제하시겠어요?"))) return;
    setDeletingId(postId);
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/feed/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok: boolean };
      if (j.ok) {
        setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
        startTransition(() => router.refresh());
      }
    } catch {
      // 무시
    } finally {
      setDeletingId(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/feed`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, post_type: postType }),
      });
      const j = (await res.json()) as { ok: boolean; post?: MeetingFeedPostDTO; error?: string };
      if (!j.ok) {
        const code = (j as { error?: string }).error;
        setErr(
          code === "too_long"
            ? "글이 너무 깁니다 (최대 2000자)."
            : code === "feed_disabled"
              ? "모임 설정상 피드 글 작성이 비활성화되어 있습니다. 운영자만 작성할 수 있습니다."
              : "작성에 실패했습니다.",
        );
        return;
      }
      if (j.post) {
        setLocalPosts((prev) => [j.post!, ...prev]);
      }
      setContent("");
      setPostType("normal");
      setShowForm(false);
      startTransition(() => router.refresh());
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
        <p className="text-[12px] font-semibold text-gray-800">연동 상태</p>
        <ul className="mt-2 space-y-1 text-[12px] text-gray-600">
          <li className="flex justify-between gap-2">
            <span>피드 글 (표시)</span>
            <span className="font-medium text-gray-900">{sorted.length}건</span>
          </li>
          <li className="flex justify-between gap-2">
            <span>회원 작성</span>
            <span className={allowFeed !== false ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
              {allowFeed !== false ? "허용 · 모두 읽기/쓰기" : "제한 · 운영자만 작성"}
            </span>
          </li>
        </ul>
        {!canWrite ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
            모임 설정에서 피드 글 작성이 꺼져 있어 일반 멤버는 글을 쓸 수 없습니다. 글 목록은 모두 볼 수
            있습니다.
          </p>
        ) : null}
      </div>

      {/* 신고 모달 */}
      {reportTarget && (
        <MeetingReportModal
          meetingId={meetingId}
          targetType="feed_post"
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* 글쓰기 입력창 스타일 CTA */}
      {canWrite && showForm ? (
        <form onSubmit={(e) => void onSubmit(e)} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* 유형 선택 탭 */}
          <div className="flex gap-1 border-b border-gray-100 px-3 pt-3 pb-2">
            {typeOptions.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPostType(t.value)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  postType === t.value
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder="모임 멤버들에게 전하고 싶은 이야기를 남겨보세요."
            className="w-full resize-none px-4 py-3 text-[14px] leading-relaxed text-gray-800 placeholder-gray-400 outline-none"
          />

          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400">{content.length}/2000</span>
              {err && <span className="text-[11px] text-red-500">{err}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setContent(""); setErr(""); }}
                className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="rounded-xl bg-emerald-500 px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {submitting ? "게시 중…" : "게시"}
              </button>
            </div>
          </div>
        </form>
      ) : canWrite ? (
        /* 입력창처럼 생긴 CTA */
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-sm hover:border-emerald-300"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[14px] font-semibold text-gray-500">
            +
          </div>
          <span className="flex-1 text-[14px] text-gray-400">모임 멤버들에게 글을 남겨보세요…</span>
        </button>
      ) : null}

      {/* 피드 목록 */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <p className="text-[32px]">📝</p>
          <p className="mt-2 text-[14px] text-gray-400">아직 피드 글이 없어요.</p>
          <p className="mt-1 text-[12px] text-gray-400">첫 글을 남겨보세요.</p>
        </div>
      ) : (
        sorted.map((post) => {
          const typeLabel = POST_TYPE_LABELS[post.post_type] ?? "";
          const isMine = post.author_user_id === currentUserId;
          const authorIsHost = isHost && post.author_user_id === currentUserId;
          return (
            <div
              key={post.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                post.is_pinned ? "border-amber-200 bg-amber-50/40" : "border-gray-100"
              }`}
            >
              {(post.is_pinned || typeLabel) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {post.is_pinned && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      📌 고정
                    </span>
                  )}
                  {typeLabel && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {typeLabel}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[12px] font-semibold text-gray-600">
                  {(post.author_name || "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-gray-900">
                      {post.author_name || "알 수 없음"}
                    </span>
                    {isMine && (
                      <span className="rounded-full bg-sky-50 px-1.5 py-0 text-[10px] text-sky-600">나</span>
                    )}
                    {authorIsHost && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700">모임장</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">{formatTime(post.created_at)}</p>
                </div>
                {/* 액션 버튼 */}
                <div className="flex shrink-0 items-center gap-1">
                  {isMine && (
                    <button
                      type="button"
                      disabled={deletingId === post.id}
                      onClick={() => void handleDelete(post.id)}
                      className="rounded-full p-1.5 text-[12px] text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="삭제"
                    >
                      🗑
                    </button>
                  )}
                  {isHost && !isMine && (
                    <button
                      type="button"
                      disabled={deletingId === post.id}
                      onClick={() => void handleDelete(post.id)}
                      className="rounded-full p-1.5 text-[12px] text-gray-400 hover:bg-red-50 hover:text-red-500"
                      title="삭제 (모임장)"
                    >
                      🗑
                    </button>
                  )}
                  {!isMine && (
                    <button
                      type="button"
                      onClick={() => setReportTarget({ id: post.id })}
                      className="rounded-full p-1.5 text-[14px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="신고"
                    >
                      ···
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-800">
                {post.content}
              </p>
            </div>
          );
        })
      )}

      {isPending && (
        <p className="text-center text-[12px] text-gray-400">새로고침 중…</p>
      )}
    </div>
  );
}
