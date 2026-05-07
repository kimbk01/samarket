"use client";

/**
 * 다른 매장 장바구니와 충돌 시 — 배달앱식 교체 확인
 */
export function StoreCartOtherStoreConflictDialog({
  open,
  onCancel,
  onClearAndAdd,
}: {
  open: boolean;
  onCancel: () => void;
  onClearAndAdd: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="닫기"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="store-cart-conflict-title"
        className="relative z-[1] w-full max-w-[min(92vw,22rem)] rounded-[16px] bg-white p-5 shadow-xl"
      >
        <h2 id="store-cart-conflict-title" className="text-[15px] font-bold leading-snug text-neutral-900">
          다른 매장의 상품이 장바구니에 있습니다.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
          기존 장바구니를 비우고 이 상품을 담을까요?
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[12px] border border-neutral-200 bg-white py-3 text-[14px] font-semibold text-neutral-700 active:bg-neutral-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onClearAndAdd}
            className="flex-1 rounded-[12px] py-3 text-[14px] font-bold text-white shadow-sm active:opacity-95"
            style={{ backgroundColor: "#1C8DB8" }}
          >
            비우고 담기
          </button>
        </div>
      </div>
    </div>
  );
}
