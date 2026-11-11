"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import { MOIM_REPORT_REASON_CODES, type MoimReportReasonCode } from "@/lib/moim/moim-report-reasons";
import type { MessageKey } from "@/lib/i18n/messages";
import { chipClass, moimCls } from "@/components/moim/moim-ui";

export type MoimReportTarget = { type: "moim" | "member" | "post" | "comment" | "album"; id: string };

/** 신고 시트 — 사유 칩 + 선택 메모 (설계 §6 P13) */
export function MoimReportSheet({
  moimId,
  target,
  onClose,
  onDone,
}: {
  moimId: string;
  /** null 이면 닫힘 */
  target: MoimReportTarget | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<MoimReportReasonCode | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason(null);
    setDetail("");
    setError(null);
  }, [target]);

  const submit = async () => {
    if (!target || !reason || busy) return;
    setBusy(true);
    setError(null);
    const r = await moimApi.report(moimId, {
      targetType: target.type,
      targetId: target.id,
      reasonCode: reason,
      detail: detail.trim() || null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(t(moimErrorKey(r.error)));
      return;
    }
    onDone(t("moim_report_done_toast"));
    onClose();
  };

  return (
    <DibayUsableAreaSheet
      open={target != null}
      onClose={onClose}
      preferredHeightRatio={null}
      header={<DibaySheetHeader title={t("moim_report_title")} onClose={onClose} closeLabel={t("common_close")} />}
      footer={
        <div className="px-4 pb-3 pt-2">
          <button type="button" className={`${moimCls.btnPrimary} w-full`} disabled={!reason || busy} onClick={submit}>
            {t("moim_report_submit_btn")}
          </button>
        </div>
      }
    >
      <div className="grid gap-3 px-4 pb-2">
        <p className={moimCls.hint}>{t("moim_report_lead")}</p>
        <div className="flex flex-wrap gap-1.5">
          {MOIM_REPORT_REASON_CODES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={reason === code}
              className={chipClass(reason === code)}
              onClick={() => setReason(code)}
            >
              {t(`moim_report_reason_${code}` as MessageKey)}
            </button>
          ))}
        </div>
        <label className="grid gap-1.5">
          <span className={moimCls.label}>{t("moim_report_detail_label")}</span>
          <textarea
            className={`${moimCls.textarea} min-h-[88px]`}
            value={detail}
            maxLength={1000}
            placeholder={t("moim_report_detail_placeholder")}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        {error ? <p className={moimCls.noticeBad}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}
