"use client";

import { useEffect, useState } from "react";
import { SELLER_CANCEL_SALE_CONFIRM_MESSAGE } from "@/lib/posts/seller-cancel-sale-ui";

export function PostDetailSellerMoreSheet({
  open,
  onClose,
  onCancelSale,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCancelSale: () => void;
  busy?: boolean;
}) {
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setSlideIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="닫기" />
      <div
        className={`relative w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-white px-4 pb-8 pt-2 shadow-xl transition-transform duration-300 ease-out ${
          slideIn ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-gray-300" aria-hidden />
        <h2 className="mb-3 px-1 text-[16px] font-semibold text-gray-900">내 물품</h2>
        <div className="rounded-ui-rect border border-gray-100 bg-gray-50 p-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) return;
              onCancelSale();
            }}
            className="flex w-full items-center justify-center rounded-ui-rect bg-red-600 px-3 py-3 text-[15px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "처리 중…" : "물품 판매 취소"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-ui-rect border border-gray-200 bg-white py-2.5 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
