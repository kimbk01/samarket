"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { createReport } from "@/lib/reports/createReport";
import { AppBackButton } from "@/components/navigation/AppBackButton";

interface ReportReasonModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ReportReasonModal({
  postId,
  open,
  onClose,
  onSuccess,
}: ReportReasonModalProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSelect = async (label: string, code: string) => {
    if (code === "report_author") {
      onClose();
      onSuccess?.();
      router.push(`/post/${postId}?reportAuthor=1`);
      return;
    }
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === "" ? prev : ""));
    const res = await createReport(postId, label);
    setSubmitting((prev) => (prev ? false : prev));
    if (res.ok) {
      onClose();
      onSuccess?.();
    } else {
      setError(res.error ?? "신고 접수에 실패했습니다.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-sam-surface">
      <header className="flex shrink-0 items-center justify-between border-b border-sam-border bg-sam-surface px-4 py-3">
        <AppBackButton onBack={onClose} ariaLabel="닫기" />
        <span className="sam-text-body-lg font-medium text-sam-fg">신고</span>
        <span className="w-11 shrink-0" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h2 className="sam-text-page-title font-bold text-sam-fg">
          게시글을 신고하는 이유를 선택해주세요.
        </h2>

        {error && (
          <p className="mt-2 sam-text-body text-red-600">{error}</p>
        )}

        <ul className="mt-4 divide-y divide-sam-border-soft">
          {POST_REPORT_REASONS.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSelect(r.label, r.code)}
                className={`flex w-full items-center justify-between gap-2 py-4 text-left disabled:opacity-50 ${
                  r.isAuthor ? "text-blue-600" : "text-sam-fg"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="sam-text-body font-medium">{r.label}</p>
                  {r.subLabel && (
                    <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{r.subLabel}</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-sam-meta" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
