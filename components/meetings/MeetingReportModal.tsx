"use client";

import { useState } from "react";

export type ReportTargetType =
  | "meeting"
  | "member"
  | "feed_post"
  | "feed_comment"
  | "chat_message"
  | "album_item";

const REASON_OPTIONS = [
  { value: "spam", label: "스팸·도배" },
  { value: "abuse", label: "욕설·혐오" },
  { value: "sexual", label: "음란·성적" },
  { value: "illegal", label: "불법 행위" },
  { value: "impersonation", label: "사칭" },
  { value: "off_topic", label: "주제 무관" },
  { value: "etc", label: "기타" },
] as const;

const TARGET_LABEL: Record<ReportTargetType, string> = {
  meeting: "모임",
  member: "멤버",
  feed_post: "피드 글",
  feed_comment: "피드 댓글",
  chat_message: "채팅 메시지",
  album_item: "앨범 사진",
};

interface MeetingReportModalProps {
  meetingId: string;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

export function MeetingReportModal({
  meetingId,
  targetType,
  targetId,
  onClose,
}: MeetingReportModalProps) {
  const [reasonType, setReasonType] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async () => {
    if (!reasonType) {
      setErr("신고 사유를 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/philife/meetings/${meetingId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          reason_type: reasonType,
          reason_detail: detail.trim() || null,
        }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        if (j.error === "already_reported") {
          setErr("이미 신고한 내용입니다.");
        } else {
          setErr("신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      setDone(true);
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* 배경 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 바텀 시트 */}
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-white px-4 pb-8 pt-4 shadow-xl">
        {/* 핸들 */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

        {done ? (
          /* 완료 화면 */
          <div className="py-6 text-center">
            <p className="text-[28px]">✅</p>
            <p className="mt-3 text-[16px] font-semibold text-gray-900">신고가 접수되었습니다</p>
            <p className="mt-1 text-[13px] text-gray-500">
              검토 후 필요한 조치를 취하겠습니다.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-ui-rect bg-gray-900 py-3 text-[14px] font-semibold text-white"
            >
              닫기
            </button>
          </div>
        ) : (
          /* 신고 폼 */
          <>
            <h2 className="text-[16px] font-semibold text-gray-900">
              {TARGET_LABEL[targetType]} 신고
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              신고 사유를 선택해 주세요.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {REASON_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReasonType(r.value)}
                  className={`rounded-ui-rect border py-2.5 text-[13px] font-medium transition-colors ${
                    reasonType === r.value
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="상세 내용을 입력해 주세요. (선택)"
              className="mt-3 w-full resize-none rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100"
            />

            {err && <p className="mt-2 text-[12px] text-red-500">{err}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-ui-rect border border-gray-200 py-3 text-[14px] font-medium text-gray-600"
              >
                취소
              </button>
              <button
                type="button"
                disabled={submitting || !reasonType}
                onClick={() => void onSubmit()}
                className="flex-1 rounded-ui-rect bg-red-500 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "신고 중…" : "신고하기"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
