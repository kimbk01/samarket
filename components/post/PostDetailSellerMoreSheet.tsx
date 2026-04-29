"use client";

import { useEffect, useState } from "react";
import { SELLER_CANCEL_SALE_CONFIRM_MESSAGE } from "@/lib/posts/seller-cancel-sale-ui";

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export function PostDetailSellerMoreSheet({
  open,
  onClose,
  onEdit,
  onDelete,
  onCancelSale,
  busy,
  editLocked,
  deleteLocked,
  editLockHint,
  deleteLockHint,
}: {
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelSale: () => void;
  busy?: boolean;
  editLocked?: boolean;
  deleteLocked?: boolean;
  editLockHint?: string;
  deleteLockHint?: string;
}) {
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn((prev) => (prev ? false : prev));
      return;
    }
    const id = requestAnimationFrame(() => setSlideIn((prev) => (prev ? prev : true)));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const eLocked = !!editLocked;
  const dLocked = !!deleteLocked;
  const showLockBanner =
    (eLocked || dLocked) && ((editLockHint ?? "").trim() || (deleteLockHint ?? "").trim());

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="닫기" />
      <div
        className={`relative w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-4 pb-8 pt-2 shadow-xl transition-transform duration-300 ease-out ${
          slideIn ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-sam-surface-muted" aria-hidden />
        <h2 className="mb-3 px-1 sam-text-body-lg font-semibold text-sam-fg">내 물품</h2>
        {busy ? (
          <p className="mb-2 text-center sam-text-body-secondary text-sam-muted">처리 중…</p>
        ) : null}
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-2">
          {showLockBanner ? (
            <div className="space-y-1 px-3 py-2 sam-text-helper leading-snug text-amber-800">
              {eLocked ? <p>{editLockHint}</p> : null}
              {dLocked ? <p>{deleteLockHint}</p> : null}
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy || eLocked}
            title={eLocked ? editLockHint : undefined}
            onClick={() => {
              if (busy || eLocked) return;
              onClose();
              onEdit();
            }}
            className="flex w-full items-center gap-3 rounded-ui-rect px-3 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-surface disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconPencil className="h-5 w-5 text-sam-muted" />
            수정
          </button>
          <button
            type="button"
            disabled={busy || dLocked}
            title={dLocked ? deleteLockHint : undefined}
            onClick={() => {
              if (busy || dLocked) return;
              if (!window.confirm("이 글을 삭제할까요? 삭제 후에는 피드에서 사라져요.")) return;
              onDelete();
            }}
            className="flex w-full items-center gap-3 rounded-ui-rect px-3 py-2.5 text-left sam-text-body text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconTrash className="h-5 w-5 text-red-500" />
            삭제
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) return;
              onCancelSale();
            }}
            className="mt-2 flex w-full items-center justify-center rounded-ui-rect bg-red-600 px-3 py-3 sam-text-body font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            물품 판매 취소
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
