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
      <div className="relative z-[1] w-full max-w-md rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface shadow-xl sm:rounded-ui-rect">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 id="trade-buyer-picker-title" className="text-[16px] font-semibold text-sam-fg">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-[13px] text-sam-muted">{subtitle}</p> : null}
        </div>
        <ul className="max-h-[min(60vh,360px)] overflow-y-auto py-1">
          {candidates.map((c) => (
            <li key={c.buyerId}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-sam-fg hover:bg-signature/5 active:bg-signature/10"
              >
                <span className="truncate font-medium">{c.buyerNickname}</span>
                <span className="ml-2 shrink-0 text-[12px] text-signature">선택</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-sam-border-soft p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-ui-rect border border-sam-border py-2.5 text-[14px] font-medium text-sam-fg hover:bg-sam-app"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
