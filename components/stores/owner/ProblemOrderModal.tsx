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
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-bold text-gray-900">문제 주문 처리</h2>
        <p className="mt-2 text-xs text-gray-600">
          관리자 검토용 메모가 저장됩니다. (샘플: 주문 상태가 환불 요청으로 바뀝니다.)
        </p>
        <label className="mt-3 block text-xs font-medium text-gray-600">관리자 전달 메모 (필수)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          placeholder="예: 라이더 연락 두절, 고객 분쟁 등"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setText("");
              onClose();
            }}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
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
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            접수
          </button>
        </div>
      </div>
    </div>
  );
}
