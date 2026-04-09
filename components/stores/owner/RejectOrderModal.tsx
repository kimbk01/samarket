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
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] bg-white p-4 shadow-xl sm:rounded-ui-rect">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {warnAccepted ? (
          <p className="mt-2 rounded-ui-rect bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
            이미 접수한 주문입니다. 거절 시 고객 불만·환불 이슈가 생길 수 있습니다.
          </p>
        ) : null}
        <label className="mt-3 block text-xs font-medium text-gray-600">거절 사유 (필수)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-sm"
          placeholder="예: 재고 소진, 준비 불가 등"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setText("");
              onClose();
            }}
            className="rounded-ui-rect border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
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
            className="rounded-ui-rect bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            거절 확정
          </button>
        </div>
      </div>
    </div>
  );
}
