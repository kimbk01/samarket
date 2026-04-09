"use client";

import { useState } from "react";

export function DeliveryReasonModal({
  open,
  title,
  label,
  confirmLabel,
  onClose,
  onConfirm,
  required,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  required?: boolean;
}) {
  const [text, setText] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] bg-white p-4 shadow-xl sm:rounded-ui-rect">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <label className="mt-3 block text-xs font-medium text-gray-600">{label}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-sm"
          placeholder={required ? "필수 입력" : "선택 입력"}
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
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (required && !text.trim()) return;
              onConfirm(text.trim());
              setText("");
              onClose();
            }}
            className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-semibold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
