"use client";

/** LINE 스타일 — 메시지 롱프레스 시 하단 액션 시트 */
export function LineOpenChatMessageActionSheet({
  open,
  onClose,
  onReply,
  onCopy,
  showBlind,
  onBlind,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  showBlind: boolean;
  onBlind: () => void;
  busy: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="메시지 메뉴">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="닫기"
        disabled={busy}
        onClick={() => !busy && onClose()}
      />
      <div className="relative rounded-t-[14px] bg-[#ececec] px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-neutral-400/70" aria-hidden />
        <div className="overflow-hidden rounded-xl bg-white">
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center justify-center border-b border-neutral-100 py-3.5 text-[16px] text-neutral-900 active:bg-neutral-50 disabled:opacity-40"
            onClick={() => {
              onReply();
              onClose();
            }}
          >
            답장
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex w-full items-center justify-center border-b border-neutral-100 py-3.5 text-[16px] text-neutral-900 active:bg-neutral-50 disabled:opacity-40"
            onClick={() => {
              void onCopy();
              onClose();
            }}
          >
            복사
          </button>
          {showBlind ? (
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center justify-center py-3.5 text-[16px] font-medium text-rose-600 active:bg-rose-50 disabled:opacity-40"
              onClick={() => {
                onBlind();
              }}
            >
              블라인드
            </button>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          className="mt-2 w-full rounded-xl bg-white py-3.5 text-[16px] font-semibold text-neutral-900 active:bg-neutral-50 disabled:opacity-40"
          onClick={() => !busy && onClose()}
        >
          취소
        </button>
      </div>
    </div>
  );
}
