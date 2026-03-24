"use client";

import { useEffect } from "react";

export type PostListMenuAction =
  | "interest"
  | "not_interest"
  | "hide"
  | "exposure_criteria"
  | "report";

interface PostListMenuBottomSheetProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: PostListMenuAction) => void;
}

function IconPlusCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconMinusCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconEyeSlash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function IconQuestionCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconReport({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

export function PostListMenuBottomSheet({
  open,
  onClose,
  onAction,
}: PostListMenuBottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handle = (action: PostListMenuAction) => {
    onAction?.(action);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="닫기"
      />
      <div className="relative w-full max-w-lg rounded-t-2xl bg-white px-4 pb-8 pt-2 shadow-xl">
        <div className="mb-2 h-1 w-10 shrink-0 self-center rounded-full bg-gray-200" aria-hidden />

        <div className="mt-4 space-y-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-2">
            <button
              type="button"
              onClick={() => handle("interest")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-gray-900 hover:bg-white"
            >
              <IconPlusCircle className="h-5 w-5 text-gray-500" />
              관심 있음
            </button>
            <button
              type="button"
              onClick={() => handle("not_interest")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-gray-900 hover:bg-white"
            >
              <IconMinusCircle className="h-5 w-5 text-gray-500" />
              관심 없음
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-2">
            <button
              type="button"
              onClick={() => handle("hide")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-gray-900 hover:bg-white"
            >
              <IconEyeSlash className="h-5 w-5 text-gray-500" />
              이 글 숨기기
            </button>
            <button
              type="button"
              onClick={() => handle("exposure_criteria")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-gray-900 hover:bg-white"
            >
              <IconQuestionCircle className="h-5 w-5 text-gray-500" />
              게시글 노출 기준
            </button>
            <button
              type="button"
              onClick={() => handle("report")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-red-600 hover:bg-red-50"
            >
              <IconReport className="h-5 w-5 text-red-500" />
              신고하기
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gray-100 py-3.5 text-[15px] font-medium text-gray-700 hover:bg-gray-200"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
