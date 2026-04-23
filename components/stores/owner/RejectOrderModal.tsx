"use client";

import { useState } from "react";

export function RejectOrderModal({
  open,
  title = "주문 거절",
  warnAccepted,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  /** 접수 후 거절 경고 문구 */
  warnAccepted?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface p-4 shadow-[0_8px_24px_rgba(31,36,48,0.14)] sm:rounded-ui-rect">
        <h2 className="text-[16px] font-bold leading-[1.35] text-sam-fg">{title}</h2>
        {warnAccepted ? (
          <p className="mt-2 rounded-ui-rect bg-amber-50 px-3 py-2 text-[13px] font-normal text-amber-950 ring-1 ring-amber-200">
            이미 접수한 주문입니다. 거절 시 고객 불만·환불 이슈가 생길 수 있습니다.
          </p>
        ) : null}
        <label className="mt-3 block text-[13px] font-semibold text-sam-fg">거절 사유 (필수)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="sam-textarea mt-1 min-h-[96px]"
          placeholder="예: 재고 소진, 준비 불가 등"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setText("");
              onClose();
            }}
            className="sam-btn-secondary px-4"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => {
              if (!text.trim()) return;
              onConfirm(text.trim());
              setText("");
              onClose();
            }}
            className="sam-btn-danger px-4"
          >
            거절 확정
          </button>
        </div>
      </div>
    </div>
  );
}
