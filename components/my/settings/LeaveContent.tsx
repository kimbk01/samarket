"use client";

import Link from "next/link";
import { useState } from "react";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

export function LeaveContent() {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/leave-request", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requestedAt?: string;
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : "탈퇴 요청을 접수하지 못했습니다.");
        return;
      }
      setSubmittedAt(typeof json.requestedAt === "string" ? json.requestedAt : new Date().toISOString());
    } catch {
      setError("탈퇴 요청을 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-sam-muted">
        탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.
      </p>
      {submittedAt ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[14px] font-medium text-emerald-800">탈퇴 요청이 접수되었습니다.</p>
          <p className="mt-1 text-[13px] text-emerald-700">
            접수 시간: {new Date(submittedAt).toLocaleString("ko-KR")}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 text-[13px] text-red-600">
          {error}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="flex gap-2">
          <Link
            href={MYPAGE_MAIN_HREF}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-[14px] font-medium text-sam-fg"
          >
            취소
          </Link>
          <button
            type="button"
            disabled={submitting || submittedAt != null}
            onClick={() => setStep(2)}
            className="rounded-ui-rect bg-red-500 px-4 py-2 text-[14px] font-medium text-white"
          >
            탈퇴하기
          </button>
        </div>
      ) : (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4">
          <p className="text-[14px] font-medium text-red-800">정말 탈퇴하시겠습니까?</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep(1)}
              className="rounded border border-sam-border px-3 py-1.5 text-[14px] text-sam-fg"
            >
              취소
            </button>
            <button
              type="button"
              disabled={submitting || submittedAt != null}
              onClick={handleConfirm}
              className="rounded bg-red-500 px-3 py-1.5 text-[14px] font-medium text-white"
            >
              {submitting ? "요청 중" : "탈퇴 요청"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
