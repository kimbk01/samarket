"use client";

export type TradeBuyerPickCandidate = {
  buyerId: string;
  chatId: string;
  buyerNickname: string;
};

export function TradeBuyerPickerModal({
  open,
  title,
  subtitle,
  candidates,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  candidates: TradeBuyerPickCandidate[];
  onClose: () => void;
  onSelect: (c: TradeBuyerPickCandidate) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-buyer-picker-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="relative z-[1] w-full max-w-md rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 id="trade-buyer-picker-title" className="text-[16px] font-semibold text-gray-900">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-[13px] text-gray-600">{subtitle}</p> : null}
        </div>
        <ul className="max-h-[min(60vh,360px)] overflow-y-auto py-1">
          {candidates.map((c) => (
            <li key={c.buyerId}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-gray-900 hover:bg-violet-50 active:bg-violet-100"
              >
                <span className="truncate font-medium">{c.buyerNickname}</span>
                <span className="ml-2 shrink-0 text-[12px] text-violet-700">선택</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
