"use client";

import { useState } from "react";

export function MemberChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div className="border-t border-gray-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <button
          type="button"
          disabled
          className="shrink-0 rounded-xl border border-dashed border-gray-300 px-2 text-[11px] text-gray-400"
          title="샘플: 이미지 첨부는 스토리지 연동 후"
        >
          사진
        </button>
        <input
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          placeholder="매장에 문의할 내용을 입력하세요"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) {
                onSend(text.trim());
                setText("");
              }
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          onClick={() => {
            if (text.trim()) {
              onSend(text.trim());
              setText("");
            }
          }}
        >
          전송
        </button>
      </div>
    </div>
  );
}
