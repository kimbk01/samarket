"use client";

interface SubmitButtonProps {
  label?: string;
  submitting?: boolean;
  /** 제출 중 버튼 문구 (기본: 등록 중…) */
  submittingLabel?: string;
  onCancel?: () => void;
  disabled?: boolean;
}

export function SubmitButton({
  label = "등록하기",
  submitting = false,
  submittingLabel = "등록 중…",
  onCancel,
  disabled = false,
}: SubmitButtonProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-2 border-t border-sam-border bg-sam-surface px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] safe-area-pb">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-ui-rect border border-sam-border px-4 py-2.5 text-[15px] text-sam-muted"
        >
          취소
        </button>
      )}
      <button
        type="submit"
        disabled={disabled || submitting}
        className="flex-1 rounded-ui-rect bg-signature py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
      >
        {submitting ? submittingLabel : label}
      </button>
    </div>
  );
}
