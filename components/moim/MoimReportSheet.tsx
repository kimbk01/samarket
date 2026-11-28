"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import { MOIM_REPORT_REASON_CODES, type MoimReportReasonCode } from "@/lib/moim/moim-report-reasons";
import type { MessageKey } from "@/lib/i18n/messages";
import { chipClass, moimCls } from "@/components/moim/moim-ui";

/** 신고 대상 — 계약 P13 (모임·멤버·글·댓글·일정·앨범). 서버 `MOIM_REPORT_TARGET_TYPES` 와 같은 이름 (R3 W6 · 일정 추가) */
export const MOIM_REPORT_SHEET_TARGET_TYPES = ["moim", "member", "post", "comment", "schedule", "album"] as const;
export type MoimReportTarget = { type: (typeof MOIM_REPORT_SHEET_TARGET_TYPES)[number]; id: string };

/** 시트·다이얼로그 안 버튼·카드·입력은 12px (LOCKED `04-DESIGN-SYSTEM.md` · `--overlay-radius-md` · R3 U-07). 화면용 4px 클래스를 바꿔 쓴다 */
export const MOIM_SHEET_RADIUS = "rounded-[length:var(--overlay-radius-md)]";
export function inMoimSheet(cls: string): string {
  return cls
    .split(" ")
    .map((c) => (c === "rounded-ui-rect" ? MOIM_SHEET_RADIUS : c))
    .join(" ");
}

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
          <button type="button" className={`${inMoimSheet(moimCls.btnPrimary)} w-full`} disabled={!reason || busy} onClick={submit}>
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
            className={`${inMoimSheet(moimCls.textarea)} min-h-[88px]`}
            value={detail}
            maxLength={1000}
            placeholder={t("moim_report_detail_placeholder")}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        {error ? <p className={inMoimSheet(moimCls.noticeBad)}>{error}</p> : null}
      </div>
    </DibayUsableAreaSheet>
  );
}
