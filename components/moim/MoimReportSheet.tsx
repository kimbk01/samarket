"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySheetHeader, DibayUsableAreaSheet } from "@/components/ui/dibay-overlay";
import { moimApi, moimErrorKey } from "@/lib/moim/moim-client-api";
import { useClientMemberId } from "@/hooks/use-client-membership-state";
import { activeMoimReportReasons, moimReportReasonLabel, type MoimPolicyLabelItem } from "@/lib/moim/moim-report-reasons";
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

/**
 * 신고 시트에 보일 사유 (R4 §3) — 모임 상세의 `reportReasons`(운영 정책의 켜진 사유). 없으면(옛 DB) 기본 12개.
 */
export function moimReportSheetReasons(reportReasons: readonly MoimPolicyLabelItem[] | null | undefined): MoimPolicyLabelItem[] {
  return activeMoimReportReasons(reportReasons ?? null);
}

/** 신고 시트 — 사유 칩 + 선택 메모 (설계 §6 P13) */
export function MoimReportSheet({
  moimId,
  target,
  reasons,
  onClose,
  onDone,
}: {
  moimId: string;
  /** null 이면 닫힘 */
  target: MoimReportTarget | null;
  /**
   * 모임 상세의 `reportReasons` (R4 §3). 넘기지 않으면 화면 간 공유 상세(`moimApi.detail` — 60초 공유·동시 호출 1회)에서 읽는다.
   */
  reasons?: readonly MoimPolicyLabelItem[] | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t, language } = useI18n();
  const [loadedReasons, setLoadedReasons] = useState<MoimPolicyLabelItem[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason(null);
    setDetail("");
    setError(null);
  }, [target]);

  /** 회원 여부 = 회원 상태 SSOT — 캐시가 늦게 차도 다시 그린다(예전: 마운트 때 한 번 읽어 늦게 찬 회원을 놓침 · 관심이웃 설계 v2 §7) */
  const memberId = useClientMemberId("moim-report-sheet");
  /** 화면이 처음 그릴 때 같이 읽는다 — 화면도 같은 상세를 같은 때 부르므로 공유 상세의 한 번 호출에 합쳐진다(추가 요청 0) */
  useEffect(() => {
    /** 로그인 전(손님)은 신고할 수 없고 공유 상세도 저장되지 않는다 — 부르지 않는다 */
    if (reasons !== undefined || !memberId) return;
    let alive = true;
    void moimApi.detail(moimId).then((r) => {
      if (alive && r.ok) setLoadedReasons(r.moim.reportReasons ?? null);
    });
    return () => {
      alive = false;
    };
  }, [reasons, moimId, memberId]);
  const list = moimReportSheetReasons(reasons !== undefined ? reasons : loadedReasons);

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
          {list.map((item) => (
            <button
              key={item.code}
              type="button"
              aria-pressed={reason === item.code}
              className={chipClass(reason === item.code)}
              onClick={() => setReason(item.code)}
            >
              {moimReportReasonLabel(language, t, item.code, list)}
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
