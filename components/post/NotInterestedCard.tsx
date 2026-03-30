"use client";

import { useState } from "react";

export type NotInterestedReason =
  | "bought_elsewhere"
  | "not_interested_item"
  | "not_interested_category";

const REASONS: { value: NotInterestedReason; label: string }[] = [
  { value: "bought_elsewhere", label: "이미 다른 물품을 구했어요" },
  { value: "not_interested_item", label: "이 물품에 관심없어요" },
  { value: "not_interested_category", label: "이 카테고리에 관심없어요" },
];

interface NotInterestedCardProps {
  onUndo: () => void;
  onReason?: (reason: NotInterestedReason) => void;
}

function IconUndo({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function NotInterestedCard({ onUndo, onReason }: NotInterestedCardProps) {
  const [sent, setSent] = useState(false);

  const handleReason = (reason: NotInterestedReason) => {
    onReason?.(reason);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
            <IconCheck className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-medium text-gray-900">
            의견을 보내주셔서 감사해요
          </p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-200"
        >
          <IconUndo className="h-4 w-4" />
          되돌리기
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold text-gray-900">
          관심 없는 이유가 있나요?
        </p>
        <button
          type="button"
          onClick={onUndo}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-200"
        >
          <IconUndo className="h-4 w-4" />
          되돌리기
        </button>
      </div>
      <ul className="mt-3 border-t border-gray-200">
        {REASONS.map((r, i) => (
          <li key={r.value}>
            <button
              type="button"
              onClick={() => handleReason(r.value)}
              className="flex w-full items-center gap-3 border-b border-gray-200 py-3 text-left text-[14px] text-gray-800 hover:bg-gray-200/50 last:border-b-0"
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
