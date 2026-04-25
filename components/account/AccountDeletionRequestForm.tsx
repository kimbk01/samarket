"use client";

import Link from "next/link";
import { useState } from "react";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

type Props = {
  source: "mypage_settings" | "web_delete_request";
};

export function AccountDeletionRequestForm({ source }: Props) {
  const [confirmationText, setConfirmationText] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (confirmationText.trim() !== "계정삭제") {
      setError("최종 확인 입력란에 `계정삭제`를 정확히 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          confirmationText: confirmationText.trim(),
          reason: reason.trim() || null,
          source,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requestedAt?: string;
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : "계정 삭제 요청을 접수하지 못했습니다.");
        return;
      }
      setSubmittedAt(typeof json.requestedAt === "string" ? json.requestedAt : new Date().toISOString());
    } catch {
      setError("계정 삭제 요청을 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-body font-semibold text-sam-fg">삭제 시 사라지는 정보</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-muted">
          <li>프로필 표시 정보와 연락처, 로그인 연결 정보</li>
          <li>찜, 관심 사용자, 개인 설정값</li>
          <li>서비스 내 개인화 상태</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4">
        <p className="sam-text-body font-semibold text-sam-fg">보관될 수 있는 기록</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-body-secondary text-sam-fg">
          <li>거래, 신고, 정산, 감사 로그 등 법적/운영상 필요한 기록</li>
          <li>게시글과 댓글의 운영상 식별 불가 표기(예: 탈퇴한 사용자)</li>
          <li>안전 및 분쟁 대응을 위한 최소 보관 정보</li>
        </ul>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-[13px] font-semibold text-sam-fg">삭제 사유 (선택)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
          placeholder="개선 의견이나 삭제 사유를 남길 수 있습니다."
        />
      </div>

      <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4">
        <label className="block text-[13px] font-semibold text-red-800">최종 확인 입력</label>
        <p className="mt-1 sam-text-body-secondary text-red-700">계속하려면 아래 입력란에 `계정삭제`를 입력해 주세요.</p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          className="mt-3 w-full rounded-ui-rect border border-red-200 bg-white px-3 py-2 sam-text-body"
          placeholder="계정삭제"
        />
      </div>

      {submittedAt ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 p-4">
          <p className="sam-text-body font-medium text-emerald-800">계정 삭제 요청이 접수되었습니다.</p>
          <p className="mt-1 sam-text-body-secondary text-emerald-700">
            접수 시간: {new Date(submittedAt).toLocaleString("ko-KR")}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 sam-text-body-secondary text-red-600">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {source === "mypage_settings" ? (
          <Link
            href={MYPAGE_MAIN_HREF}
            className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            취소
          </Link>
        ) : null}
        <button
          type="button"
          disabled={submitting || submittedAt != null}
          onClick={() => void handleConfirm()}
          className="rounded-ui-rect bg-red-500 px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {submitting ? "요청 중…" : "계정 삭제 요청"}
        </button>
      </div>
    </div>
  );
}
