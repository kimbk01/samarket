"use client";

import { useState } from "react";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

const QUICK = ["조리 시작했습니다", "10분 정도 지연됩니다", "픽업 가능합니다", "네 가능합니다"];

export function OwnerChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const keyboardInsetPx = useMobileKeyboardInset();
  const bottomPadPx = Math.max(8, keyboardInsetPx);
  return (
    <div
      className="border-t border-sam-border bg-sam-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomPadPx}px)` }}
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            className="rounded-full bg-sam-surface-muted px-2 py-1 text-[11px] text-sam-fg"
            onClick={() => onSend(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled
          className="shrink-0 rounded-ui-rect border border-dashed border-sam-border px-2 text-[11px] text-sam-meta"
        >
          사진
        </button>
        <input
          className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
          placeholder="고객에게 답장"
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
          className="shrink-0 rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
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
