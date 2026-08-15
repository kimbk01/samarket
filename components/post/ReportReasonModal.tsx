"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { createReport } from "@/lib/reports/createReport";
import { DibayFullSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const { t } = useI18n();
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

  return (
    <DibayFullSheet open={open} onClose={onClose} title={t("common_report")} hideBottomNav>
      <h2 className={`${OverlayUi.title} !text-left`}>
        게시글을 신고하는 이유를 선택해주세요.
      </h2>

      {error ? (
        <p className="mt-2 text-sm text-[color:var(--overlay-danger)]">{error}</p>
      ) : null}

      <ul className="mt-4 divide-y divide-[color:var(--overlay-border)]">
        {POST_REPORT_REASONS.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSelect(r.label, r.code)}
              className={`flex w-full items-center justify-between gap-2 py-4 text-left disabled:opacity-50 ${
                r.isAuthor ? "text-[color:var(--overlay-primary)]" : "text-[color:var(--overlay-text-primary)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.label}</p>
                {r.subLabel ? (
                  <p className={`mt-0.5 ${OverlayUi.bodySecondary}`}>{r.subLabel}</p>
                ) : null}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 opacity-40" />
            </button>
          </li>
        ))}
      </ul>
    </DibayFullSheet>
  );
}
