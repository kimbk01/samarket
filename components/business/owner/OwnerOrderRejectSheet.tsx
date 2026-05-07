"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";

const REASONS = [
  "재료 소진",
  "영업 시간 외",
  "배달 불가 지역",
  "주문 폭주",
  "시스템 오류",
  "기타",
] as const;

export function OwnerOrderRejectSheet({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reasonLabel: string) => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0]!);
  const [other, setOther] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason(REASONS[0]!);
    setOther("");
  }, [open]);

  if (!open) return null;

  const label = reason === "기타" ? other.trim() || "기타" : reason;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-order-reject-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={[
          "relative z-[1] w-full max-w-md rounded-t-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-4 shadow-2xl sm:rounded-[16px]",
          "max-h-[min(90vh,520px)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]",
        ].join(" ")}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--biz-card-border)] sm:hidden" aria-hidden />
        <h2 id="owner-order-reject-title" className={Biz.textCardTitle}>
          주문 거절
        </h2>
        <p className={`mt-1 ${Biz.textMuted}`}>사유를 선택한 뒤 거절합니다. (내부 확인용 — 고객 알림 문구는 플랫폼 정책을 따릅니다)</p>

        <div className="mt-3 flex flex-col gap-2">
          {REASONS.map((r) => (
            <label
              key={r}
              className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[14px] border px-3 ${
                reason === r
                  ? "border-[var(--biz-primary)] bg-[var(--biz-primary-soft)]"
                  : "border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]"
              }`}
            >
              <input
                type="radio"
                name="reject-reason"
                className="h-4 w-4 accent-[var(--biz-primary)]"
                checked={reason === r}
                onChange={() => setReason(r)}
                disabled={busy}
              />
              <span className="text-[14px] font-medium text-[var(--biz-text)]">{r}</span>
            </label>
          ))}
        </div>

        {reason === "기타" ? (
          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-[var(--biz-text-muted)]">기타 사유</span>
            <textarea
              disabled={busy}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-app-bg)] px-3 py-2 text-[14px] text-[var(--biz-text)]"
            />
          </label>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className={[Biz.btnOutline, "w-full sm:w-auto"].join(" ")}>
            닫기
          </button>
          <button
            type="button"
            disabled={busy || (reason === "기타" && !other.trim())}
            onClick={() => onConfirm(label)}
            className="w-full rounded-[14px] border border-red-200 bg-white px-4 py-3 text-[15px] font-semibold text-red-700 shadow-sm sm:w-auto min-h-[52px]"
          >
            {busy ? "처리 중…" : "주문 거절"}
          </button>
        </div>
      </div>
    </div>
  );
}
