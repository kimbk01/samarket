"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { createReport } from "@/lib/reports/createReport";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { DibayFullSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface ReportReasonModalProps {
  postId: string;
  /** 글 작성자 — 「작성자 신고하기」가 사용자 신고 시트를 연다. 없으면 그 항목을 숨긴다. */
  authorUserId?: string | null;
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
  authorUserId,
  open,
  onClose,
  onSuccess,
}: ReportReasonModalProps) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [authorSheetOpen, setAuthorSheetOpen] = useState(false);
  const authorId = typeof authorUserId === "string" ? authorUserId.trim() : "";
  const reasons = authorId ? POST_REPORT_REASONS : POST_REPORT_REASONS.filter((r) => !r.isAuthor);

  const handleSelect = async (label: string, code: string) => {
    if (code === "report_author") {
      setAuthorSheetOpen(true);
      return;
    }
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === "" ? prev : ""));
    const res = await createReport(postId, label, code);
    setSubmitting((prev) => (prev ? false : prev));
    if (res.ok) {
      onClose();
      onSuccess?.();
    } else {
      setError(res.error ?? t("ui_post_report_failed"));
    }
  };

  return (
    <>
      <DibayFullSheet open={open && !authorSheetOpen} onClose={onClose} title={t("common_report")} hideBottomNav>
        <h2 className={`${OverlayUi.title} !text-left`}>{t("ui_post_report_title")}</h2>

        {error ? (
          <p className="mt-2 text-sm text-[color:var(--overlay-danger)]">{error}</p>
        ) : null}

        <ul className="mt-4 divide-y divide-[color:var(--overlay-border)]">
          {reasons.map((r) => {
            const label = t(r.labelKey);
            return (
              <li key={r.code}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSelect(label, r.code)}
                  className={`flex w-full items-center justify-between gap-2 py-4 text-left disabled:opacity-50 ${
                    r.isAuthor ? "text-[color:var(--overlay-primary)]" : "text-[color:var(--overlay-text-primary)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    {r.subLabelKey ? (
                      <p className={`mt-0.5 ${OverlayUi.bodySecondary}`}>{t(r.subLabelKey)}</p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 opacity-40" />
                </button>
              </li>
            );
          })}
        </ul>
      </DibayFullSheet>
      {open && authorSheetOpen && authorId ? (
        <ReportActionSheet
          targetType="user"
          targetId={authorId}
          targetUserId={authorId}
          productId={postId}
          onClose={() => {
            setAuthorSheetOpen(false);
            onClose();
          }}
          onSuccess={() => {
            setAuthorSheetOpen(false);
            onClose();
            onSuccess?.();
          }}
        />
      ) : null}
    </>
  );
}
