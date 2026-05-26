"use client";

import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import { AddressPhCardLineText } from "@/components/addresses/AddressPhCardLineText";

/** `/mypage/addresses` · 매장 신청 · 어드민 심사 — 동일 PH 카드 본문 (세부 굵게 + 가로) */
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
  return (
    <AddressPhCardLineText
      presentation={presentation}
      detailClassName={detailClassName}
      bodyClassName={bodyClassName}
      emptyClassName={emptyClassName}
    />
  );
}
