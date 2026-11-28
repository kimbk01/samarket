"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  COMMUNITY_REPORT_REASONS,
  type CommunityReportReasonCode,
} from "@/lib/reports/community-report-reasons";

/**
 * 라운지 글·댓글 신고 시트 — 사유 선택 필수, 「기타」만 설명 필수 (감사 L9 · 설계 §6.5 · 시안 S5).
 * 글 신고와 댓글 신고가 같은 시트(제목만 다름).
 */
export function CommunityReportSheet({
  open,
  kind,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: "post" | "comment";
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (reasonCode: CommunityReportReasonCode, detail: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<CommunityReportReasonCode | null>(null);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetail("");
  }, [open]);

  const needsDetail = reason === "other";
  const canSubmit = !busy && reason != null && (!needsDetail || detail.trim().length > 0);

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={kind === "comment" ? t("community_report_comment") : t("community_report_post")}
      footer={
        <DibayOverlayButton
          roleTone="primary"
          type="button"
          className="w-full"
          disabled={!canSubmit}
          onClick={() => {
            if (reason) onSubmit(reason, detail.trim());
          }}
        >
          {t("community_report_submit")}
        </DibayOverlayButton>
      }
    >
      <div role="radiogroup" aria-label={kind === "comment" ? t("community_report_comment") : t("community_report_post")}>
        {COMMUNITY_REPORT_REASONS.map((r) => {
          const on = reason === r.code;
          return (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={on}
              className="flex min-h-12 w-full items-center gap-3 border-t border-[color:var(--overlay-border)] px-1 text-left text-[15px] first:border-t-0"
              onClick={() => setReason(r.code)}
            >
              <span
                aria-hidden
                className={`h-[18px] w-[18px] shrink-0 rounded-full border-2 ${
                  on ? "border-[6px] border-[var(--sam-primary)]" : "border-[color:var(--overlay-border-strong,#b9c0bb)]"
                }`}
              />
              {t(r.labelKey)}
            </button>
          );
        })}
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={needsDetail ? t("community_report_detail_required") : t("community_report_detail_optional")}
        className={`mt-2 min-h-[84px] w-full ${OverlayUi.input}`}
      />
      {error ? (
        <p className={`mt-1 ${OverlayUi.caption}`} style={{ color: "var(--overlay-danger)" }}>
          {error}
        </p>
      ) : null}
    </DibayBottomSheet>
  );
}
