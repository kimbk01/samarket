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
    <div className="border-t border-ig-border bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <button
          type="button"
          disabled
          className="shrink-0 rounded-ui-rect border border-dashed border-ig-border px-2 text-[11px] text-muted"
          title="샘플: 이미지 첨부는 스토리지 연동 후"
        >
          사진
        </button>
        <div className="flex min-h-[44px] min-w-0 flex-1 items-stretch rounded-ui-rect border border-ig-border bg-white px-0.5">
          <input
            className="min-h-0 min-w-0 flex-1 self-stretch border-0 bg-transparent px-2.5 py-0 text-[15px] font-normal leading-[1.35] text-foreground placeholder:text-muted focus:outline-none focus:ring-0"
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
        </div>
        <button
          type="button"
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-ui-rect bg-signature px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
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
