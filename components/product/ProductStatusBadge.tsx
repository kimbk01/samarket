"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 당근형: 상품 상태 뱃지 (sale=active, reserved, sold, hidden) */
const STATUS_LABEL_KEY: Record<
  string,
  | "ui_product_status_active"
  | "ui_product_status_reserved"
  | "trade_listing_step_completed"
  | "ui_product_status_hidden"
  | "ui_product_status_deleted"
> = {
  active: "ui_product_status_active",
  sale: "ui_product_status_active",
  reserved: "ui_product_status_reserved",
  /** 공개 거래 상태 문구 SSOT(`marketplacePublicStatusLabel`)와 같은 키 — 「판매완료」 (TM-30) */
  sold: "trade_listing_step_completed",
  hidden: "ui_product_status_hidden",
  deleted: "ui_product_status_deleted",
};

const STATUS_CLASS: Record<string, string> = {
  active: "border-2 border-current bg-sam-surface-muted text-sam-fg",
  sale: "border-2 border-current bg-sam-surface-muted text-sam-fg",
  reserved: "border-2 border-current bg-amber-50 text-amber-900",
  sold: "border-2 border-current bg-sam-surface-muted text-sam-muted",
  hidden: "border-2 border-current bg-sam-surface-muted text-sam-muted",
  deleted: "border-2 border-current bg-sam-surface-muted text-sam-meta",
};

interface ProductStatusBadgeProps {
  status: string;
  className?: string;
}

export function ProductStatusBadge({ status, className = "" }: ProductStatusBadgeProps) {
  const { t } = useI18n();
  const key = STATUS_LABEL_KEY[status];
  const label = key ? t(key) : status;
  const cls = STATUS_CLASS[status] ?? "bg-sam-surface-muted text-sam-fg";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 sam-text-xxs font-medium ${cls} ${className}`}>
      {label}
    </span>
  );
}
