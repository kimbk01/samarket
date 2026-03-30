"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_CHAT_IMAGE_ATTACH } from "@/lib/chats/chat-image-bundle";

type Props = {
  open: boolean;
  files: File[];
  onClose: () => void;
  /** 최종 선택(묶음 전송) */
  onConfirm: (files: File[]) => void;
};

/**
 * 모바일·태블릿용: OS 앨범에서 고른 뒤 3열 그리드에서 토글·묶음 전송 확인.
 * (웹은 네이티브 갤러리 UI를 대체할 수 없어, 선택 후 이 시트에서 마무리)
 */
export function ChatMobileImagePickerSheet({ open, files, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open || !files.length) return;
    setSelected(new Set(files.map((_, i) => i)));
  }, [open, files]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const capped = useMemo(() => files.slice(0, MAX_CHAT_IMAGE_ATTACH), [files]);

  const objectUrls = useMemo(() => capped.map((f) => URL.createObjectURL(f)), [capped]);

  useEffect(() => {
    return () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [objectUrls]);

  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const confirm = useCallback(() => {
    const out = capped.filter((_, i) => selected.has(i));
    if (!out.length) return;
    onConfirm(out);
    onClose();
  }, [capped, onConfirm, onClose, selected]);

  if (!open || !capped.length || typeof document === "undefined") return null;

  const selectedCount = capped.reduce((n, _, i) => n + (selected.has(i) ? 1 : 0), 0);

  /** 입력창·sticky 조상의 containing block에 묶이면 flex-1 그리드 높이가 0이 됨 — 항상 body로 포털 */
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-black/92 text-white"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal
      aria-label="사진 선택"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 py-2.5">
        <button
          type="button"
          data-kasama-round-full
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          aria-label="닫기"
          onClick={onClose}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <span className="text-[15px] font-semibold">최근 항목</span>
          <span className="ml-1 text-white/50" aria-hidden>
            ▾
          </span>
        </div>
        <button
          type="button"
          disabled={selectedCount === 0}
          className="shrink-0 rounded-lg px-3 py-2 text-[15px] font-semibold text-[#0095F6] disabled:text-white/25"
          onClick={confirm}
        >
          전송
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-0.5 py-1">
        <div className="grid grid-cols-3 gap-px bg-white/15">
          {objectUrls.map((src, i) => {
            const on = selected.has(i);
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                className="relative aspect-square w-full overflow-hidden bg-black/40 active:opacity-90"
                onClick={() => toggle(i)}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
                <span
                  className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm ${
                    on
                      ? "border-[#0095F6] bg-[#0095F6] text-white"
                      : "border-white/85 bg-white/35 backdrop-blur-[2px]"
                  }`}
                >
                  {on ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-black/90 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FEE500] text-base font-bold text-black shadow-sm"
            aria-hidden
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">사진 묶어보내기</p>
            <p className="text-[11px] text-white/55">
              선택 {selectedCount}장 · 최대 {MAX_CHAT_IMAGE_ATTACH}장
            </p>
          </div>
          <div className="flex shrink-0 gap-2 opacity-45" aria-hidden>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">✨</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">⋯</span>
          </div>
        </div>
      </footer>
    </div>,
    document.body
  );
}
