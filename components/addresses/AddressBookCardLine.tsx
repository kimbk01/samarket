"use client";

import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";

/** `/mypage/addresses` · 매장 신청 · 어드민 심사 — 동일 한 줄 (세부 굵게 + 가로) */
export function AddressBookCardLine({
  presentation,
  detailClassName = "font-bold text-sam-fg",
  bodyClassName = "font-normal text-sam-fg",
  emptyClassName = "text-sam-muted",
}: {
  presentation: AddressBookCardPresentation | null;
  detailClassName?: string;
  bodyClassName?: string;
  emptyClassName?: string;
}) {
  if (!presentation || (!presentation.gatePrefix && !presentation.streetBody)) {
    return <span className={emptyClassName}>—</span>;
  }
  return (
    <span className="leading-snug">
      {presentation.gatePrefix ? (
        <>
          <strong className={detailClassName}>{presentation.gatePrefix}</strong>
          {presentation.streetBody ? ", " : null}
        </>
      ) : null}
      {presentation.streetBody ? (
        <span className={bodyClassName}>{presentation.streetBody}</span>
      ) : null}
    </span>
  );
}
