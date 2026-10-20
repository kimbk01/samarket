"use client";

import type { ReactNode } from "react";
import type { AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { formatAdminStoreAddressPresentation } from "@/components/admin/stores/admin-store-review-model";
import { AddressBookCardLine } from "@/components/addresses/AddressBookCardLine";

/** Store review console — Admin 표준 토큰(`--sam-*`)만 사용 (원색·hex 금지). */
export function AdminStoreReviewTheme({ children }: { children: ReactNode }) {
  return (
    <div
      data-admin-stores-review
      className="text-[14px] leading-[1.55] text-sam-fg [&_input]:text-[14px] [&_textarea]:text-[14px] [&_button]:text-[14px]"
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
      <span className="text-[13px] font-semibold leading-5 text-sam-muted">{label}</span>
      <div className={`min-w-0 text-[14px] font-normal leading-5 text-sam-fg ${valueClassName ?? ""}`}>
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
    <section className={`border-b border-sam-border px-4 py-3 last:border-b-0 ${className ?? ""}`}>
      {title ? (
        <h3 className="mb-3 flex items-center gap-2 border-b border-sam-border-soft pb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-sam-fg">
          <span className="h-3.5 w-0.5 shrink-0 rounded-full bg-sam-primary" aria-hidden />
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
      detailClassName="font-semibold text-sam-fg"
      bodyClassName="font-normal text-sam-fg"
      emptyClassName="text-sam-muted"
    />
  );
}

export function sbStatusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "border-sam-success bg-sam-success-soft text-sam-success";
    case "rejected":
      return "border-sam-danger bg-sam-danger-soft text-sam-danger";
    case "suspended":
      return "border-sam-warning bg-sam-warning-soft text-sam-warning";
    case "revision_requested":
      return "border-sam-warning bg-sam-warning-soft text-sam-warning";
    case "under_review":
      return "border-sam-info bg-sam-info-soft text-sam-info";
    case "pending":
    default:
      return "border-sam-border bg-sam-surface-muted text-sam-muted";
  }
}
