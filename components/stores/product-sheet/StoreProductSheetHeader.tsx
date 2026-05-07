"use client";

import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";

export function StoreProductSheetHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col border-b border-neutral-100 bg-white px-4 pb-2.5 pt-3">
      <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-[#1C8DB8]/25" aria-hidden />
      <div className="relative flex min-h-[36px] w-full items-center justify-center">
        <h2
          id="store-add-sheet-title"
          className="line-clamp-1 px-10 text-center text-[16px] font-bold leading-tight tracking-[-0.02em] text-neutral-900"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[18px] leading-none text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 ${STORE_ORDER_TOUCH_BTN}`}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
