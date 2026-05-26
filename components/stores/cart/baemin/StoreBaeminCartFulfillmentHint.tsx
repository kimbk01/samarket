"use client";

export function StoreBaeminCartFulfillmentHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-center text-[14px] font-medium text-[color:var(--delivery-text-sub)]">
      {"\uc218\ub839\ubc29\ubc95\uc744 \uc120\ud0dd\ud574\uc8fc\uc138\uc694"}
      <span
        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--delivery-border)] text-[10px] text-[color:var(--delivery-text-muted)]"
        aria-hidden
      >
        i
      </span>
    </p>
  );
}
