"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { POST_REPORT_REASONS } from "@/lib/reports/report-utils";
import { createReport } from "@/lib/reports/createReport";
import { markPostReportedByMe } from "@/lib/reports/reported-posts-store";
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
  /** P-2: 1단계 사유 선택 → 2단계 상세(선택·「기타」는 필수) → 「신고하기」 → 접수 완료 화면 */
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState<null | "new" | "already">(null);
  const authorId = typeof authorUserId === "string" ? authorUserId.trim() : "";
  const reasons = authorId ? POST_REPORT_REASONS : POST_REPORT_REASONS.filter((r) => !r.isAuthor);
  const selected = selectedCode ? reasons.find((r) => r.code === selectedCode) ?? null : null;
  const detailMissing = Boolean(selected?.detailRequired) && !detail.trim();

  const handleSelect = (code: string) => {
    if (code === "report_author") {
      setAuthorSheetOpen(true);
      return;
    }
    setError("");
    setSelectedCode(code);
  };

  const handleSubmit = async () => {
    if (!selected || submitting || detailMissing) return;
    setSubmitting(true);
    setError("");
    const res = await createReport(postId, t(selected.labelKey), selected.code, detail);
    setSubmitting(false);
    if (res.ok) {
      markPostReportedByMe(postId);
      setDone(res.already ? "already" : "new");
    } else {
      setError(res.error ?? t("ui_post_report_failed"));
    }
  };

  const finish = () => {
    const wasDone = done !== null;
    setSelectedCode(null);
    setDetail("");
    setDone(null);
    setError("");
    onClose();
    if (wasDone) onSuccess?.();
  };

  return (
    <>
      <DibayFullSheet open={open && !authorSheetOpen} onClose={finish} title={t("common_report")} hideBottomNav>
        {done ? (
          <div className="flex flex-col gap-3 pt-6" data-post-report-step="done">
            <h2 className={`${OverlayUi.title} !text-left`}>
              {t(done === "already" ? "ui_post_report_already_title" : "ui_post_report_done_title")}
            </h2>
            <p className={OverlayUi.bodySecondary}>
              {t(done === "already" ? "ui_post_report_already_body" : "ui_post_report_done_body")}
            </p>
            <div className={`${OverlayUi.actionsStack} mt-4`}>
              <button type="button" className={OverlayUi.btn.primary} onClick={finish}>
                {t("ui_post_report_done_confirm")}
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="flex flex-col gap-3" data-post-report-step="detail">
            <h2 className={`${OverlayUi.title} !text-left`}>{t(selected.labelKey)}</h2>
            {selected.subLabelKey ? <p className={OverlayUi.bodySecondary}>{t(selected.subLabelKey)}</p> : null}
            <label className="mt-2 flex flex-col gap-2">
              <span className={OverlayUi.caption}>
                {t(selected.detailRequired ? "ui_post_report_detail_label_required" : "ui_post_report_detail_label")}
              </span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, 1000))}
                rows={5}
                maxLength={1000}
                placeholder={t("ui_post_report_detail_placeholder")}
                className={`${OverlayUi.input} min-h-[120px] resize-none`}
              />
            </label>
            {error ? <p className="text-sm text-[color:var(--overlay-danger)]">{error}</p> : null}
            <div className={`${OverlayUi.actionsStack} mt-2`}>
              <button
                type="button"
                className={OverlayUi.btn.destructive}
                disabled={submitting || detailMissing}
                onClick={() => void handleSubmit()}
              >
                {t("ui_post_report_submit")}
              </button>
              <button
                type="button"
                className={OverlayUi.btn.text}
                disabled={submitting}
                onClick={() => {
                  setSelectedCode(null);
                  setError("");
                }}
              >
                {t("ui_post_report_change_reason")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className={`${OverlayUi.title} !text-left`}>{t("ui_post_report_title")}</h2>
            <ul className="mt-4 divide-y divide-[color:var(--overlay-border)]" data-post-report-step="reason">
              {reasons.map((r) => (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(r.code)}
                    className={`flex w-full items-center justify-between gap-2 py-4 text-left ${
                      r.isAuthor ? "text-[color:var(--overlay-primary)]" : "text-[color:var(--overlay-text-primary)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(r.labelKey)}</p>
                      {r.subLabelKey ? (
                        <p className={`mt-0.5 ${OverlayUi.bodySecondary}`}>{t(r.subLabelKey)}</p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 opacity-40" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
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
