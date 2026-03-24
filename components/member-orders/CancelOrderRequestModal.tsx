"use client";

import { useState } from "react";

const PRESETS = [
  "실수로 주문했어요",
  "주소를 잘못 입력했어요",
  "메뉴를 잘못 선택했어요",
  "매장에 문의 후 취소 원해요",
  "기타",
] as const;

export function CancelOrderRequestModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reasonLabel: string, detail?: string) => void;
}) {
  const [preset, setPreset] = useState<string>(PRESETS[0]);
  const [extra, setExtra] = useState("");

  if (!open) return null;

  const needsExtra = preset === "기타";

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-bold text-gray-900">취소 요청</h2>
        <p className="mt-1 text-xs text-gray-600">
          매장 확인 후 취소·환불이 진행될 수 있어요. 조리가 시작된 뒤에는 취소가 어려울 수 있어요.
        </p>
        <div className="mt-3 space-y-2">
          {PRESETS.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50"
            >
              <input type="radio" name="cancel-reason" checked={preset === p} onChange={() => setPreset(p)} />
              {p}
            </label>
          ))}
        </div>
        {needsExtra ? (
          <label className="mt-3 block text-xs font-medium text-gray-600">
            상세 사유
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              placeholder="취소 사유를 적어 주세요"
            />
          </label>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setExtra("");
              onClose();
            }}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => {
              if (needsExtra && !extra.trim()) return;
              onConfirm(preset, needsExtra ? extra.trim() : undefined);
              setExtra("");
              onClose();
            }}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            요청하기
          </button>
        </div>
      </div>
    </div>
  );
}
