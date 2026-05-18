"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ProductStatus } from "@/lib/types/product";

const LABEL_KEYS: Record<ProductStatus, MessageKey> = {
  active: "admin_dashboard_product_active",
  reserved: "admin_dashboard_product_reserved",
  sold: "admin_dashboard_product_sold",
  hidden: "admin_dashboard_product_hidden",
  blinded: "admin_dashboard_product_blinded",
  deleted: "admin_dashboard_product_deleted",
};

const CLASSES: Record<ProductStatus, string> = {
  active: "bg-emerald-50 text-emerald-800",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-sam-border-soft text-sam-fg",
  hidden: "bg-sam-surface-muted text-sam-muted",
  blinded: "bg-orange-100 text-orange-800",
  deleted: "bg-red-50 text-red-700",
};

interface AdminStatusBadgeProps {
  status: ProductStatus;
  className?: string;
}

export function AdminStatusBadge({ status, className = "" }: AdminStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex min-w-[84px] items-center justify-center whitespace-nowrap rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(LABEL_KEYS[status])}
    </span>
  );
}
