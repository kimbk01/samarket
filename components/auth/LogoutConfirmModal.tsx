"use client";

type LogoutConfirmModalProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 설정 등에서 사용자가 로그아웃을 눌렀을 때만 표시되는 확인 모달.
 */
export function LogoutConfirmModal({
  open,
  submitting,
  error,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-desc"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        <p id="logout-confirm-title" className="sam-text-body font-semibold text-sam-fg">
          로그아웃하시겠습니까?
        </p>
        <p id="logout-confirm-desc" className="mt-2 sam-text-body-secondary text-sam-muted">
          로그아웃하면 다시 이용하려면 로그인이 필요합니다.
        </p>
        {error ? <p className="mt-3 sam-text-body-secondary text-red-600">{error}</p> : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
          >
            {submitting ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
      </div>
    </div>
  );
}
