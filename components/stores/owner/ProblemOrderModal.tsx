"use client";

import { useState } from "react";

export function ProblemOrderModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (memo: string) => void;
}) {
  const [text, setText] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface p-4 shadow-[0_8px_24px_rgba(31,36,48,0.14)] sm:rounded-ui-rect">
        <h2 className="text-[16px] font-bold leading-[1.35] text-sam-fg">문제 주문 처리</h2>
        <p className="mt-2 text-[13px] font-normal text-sam-muted">
          관리자 검토용 메모가 저장됩니다. (샘플: 주문 상태가 환불 요청으로 바뀝니다.)
        </p>
        <label className="mt-3 block text-[13px] font-semibold text-sam-fg">관리자 전달 메모 (필수)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="sam-textarea mt-1 min-h-[96px]"
          placeholder="예: 라이더 연락 두절, 고객 분쟁 등"
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
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (!text.trim()) return;
              onConfirm(text.trim());
              setText("");
              onClose();
            }}
            className="sam-btn-primary px-4"
          >
            접수
          </button>
        </div>
      </div>
    </div>
  );
}
