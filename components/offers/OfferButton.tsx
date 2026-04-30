"use client";

type Props = {
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  onClick: () => void;
  /** 거절·만료 후 재제안 */
  retry?: boolean;
};

export function OfferButton({ disabled, busy, className, onClick, retry }: Props) {
  const label = retry ? "다시 제안하기" : "가격 제안하기";
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={className}
    >
      {busy ? "보내는 중…" : label}
    </button>
  );
}
