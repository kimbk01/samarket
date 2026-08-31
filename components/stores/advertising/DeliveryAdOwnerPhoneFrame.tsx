"use client";

import type { ReactNode } from "react";

/** Design board screen 4 — exposure preview phone chrome */
export function DeliveryAdOwnerPhoneFrame({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[280px] rounded-[24px] border-[3px] border-[#757575] bg-[#F5F5F5] p-2 shadow-md"
      data-owner-ads-phone-frame="design-board"
    >
      <div className="mb-2 flex items-center justify-center gap-1">
        <span className="h-1.5 w-8 rounded-full bg-[#BDBDBD]" aria-hidden />
      </div>
      {label ? (
        <p className="mb-2 text-center text-[11px] font-medium text-[#757575]">{label}</p>
      ) : null}
      <div className="overflow-hidden rounded-[16px] bg-white">{children}</div>
    </div>
  );
}
