"use client";

import type { ReactNode } from "react";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { formatAdminStoreAddressPresentation } from "@/components/admin/stores/admin-store-review-model";
import { AddressBookCardLine } from "@/components/addresses/AddressBookCardLine";

/** Starbucks-inspired admin palette (store review console only). */
export const SB = {
  green: "#00704A",
  greenHover: "#005A3C",
  greenSoft: "#E8F2ED",
  white: "#FFFFFF",
  cream: "#F2F0EB",
  creamDark: "#E8E2D8",
  espresso: "#1E3932",
  taupe: "#6B6B6B",
  border: "#D4C5B9",
} as const;

export function AdminStoreReviewTheme({ children }: { children: ReactNode }) {
  return (
    <div
      data-admin-stores-review
      className="text-[14px] leading-[1.55] text-[#1E3932] [&_input]:text-[14px] [&_textarea]:text-[14px] [&_button]:text-[14px]"
      style={
        {
          "--sb-green": SB.green,
          "--sb-cream": SB.cream,
          "--sb-espresso": SB.espresso,
          "--sb-taupe": SB.taupe,
          "--sb-border": SB.border,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function ReviewRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <span className="text-[13px] font-semibold leading-5 text-[#6B6B6B]">{label}</span>
      <div className={`min-w-0 text-[14px] font-normal leading-5 text-[#1E3932] ${valueClassName ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

export function ReviewBlock({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-[#D4C5B9] px-4 py-3 last:border-b-0 ${className ?? ""}`}>
      {title ? (
        <h3 className="mb-3 flex items-center gap-2 border-b border-[#E8E2D8] pb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#1E3932]">
          <span className="h-3.5 w-0.5 shrink-0 rounded-full bg-[#00704A]" aria-hidden />
          {title}
        </h3>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

export function ReviewAddressValue({ store }: { store: AdminStoreReviewRow }) {
  const addr = formatAdminStoreAddressPresentation(store);
  return (
    <AddressBookCardLine
      presentation={addr}
      detailClassName="font-semibold text-[#1E3932]"
      bodyClassName="font-normal text-[#1E3932]"
      emptyClassName="text-[#6B6B6B]"
    />
  );
}

export function sbStatusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "border-[#A5D6A7] bg-[#E8F5E9] text-[#1B5E20]";
    case "rejected":
      return "border-[#EF9A9A] bg-[#FFEBEE] text-[#B71C1C]";
    case "suspended":
      return "border-[#FFCC80] bg-[#FFF3E0] text-[#E65100]";
    case "revision_requested":
      return "border-[#FFE082] bg-[#FFF8E1] text-[#F57F17]";
    case "under_review":
      return "border-[#90CAF9] bg-[#E3F2FD] text-[#1565C0]";
    case "pending":
    default:
      return "border-[#D4C5B9] bg-[#F2F0EB] text-[#6B6B6B]";
  }
}

export const sbBtn =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-sm px-3.5 py-1.5 text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-45";

export const sbBtnPrimary = `${sbBtn} bg-[#00704A] text-white hover:bg-[#005A3C]`;
export const sbBtnSecondary = `${sbBtn} border border-[#D4C5B9] bg-white text-[#1E3932] hover:bg-[#F2F0EB]`;
export const sbBtnWarn = `${sbBtn} border border-[#FFE082] bg-[#FFF8E1] text-[#F57F17] hover:bg-[#FFF3C4]`;
export const sbBtnDanger = `${sbBtn} border border-[#EF9A9A] bg-[#C62828] text-white hover:bg-[#B71C1C]`;
export const sbBtnDangerSoft = `${sbBtn} border border-[#EF9A9A] bg-white text-[#B71C1C] hover:bg-[#FFEBEE]`;
