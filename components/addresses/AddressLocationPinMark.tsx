"use client";

import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

/** 목록에서 ‘지정 이름 없음·위치만’ 행 — `AddressKindHeadPin` 과 동일 빨간 teardrop */
export function AddressLocationPinMark(props: { className?: string; "aria-label"?: string }) {
  const { className, "aria-label": ariaLabel } = props;
  return <AddressKindHeadPin kind="general" className={className} aria-label={ariaLabel} />;
}
