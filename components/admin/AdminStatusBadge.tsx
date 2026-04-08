"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProductStatus } from "@/lib/types/product";

const LABELS: Record<ProductStatus, string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제",
};

const CLASSES: Record<ProductStatus, string> = {
  active: "bg-emerald-50 text-emerald-800",
  reserved: "bg-amber-100 text-amber-800",
  sold: "bg-gray-200 text-gray-700",
  hidden: "bg-gray-100 text-gray-600",
  blinded: "bg-orange-100 text-orange-800",
  deleted: "bg-red-50 text-red-700",
};

interface AdminStatusBadgeProps {
  status: ProductStatus;
  className?: string;
}

export function AdminStatusBadge({ status, className = "" }: AdminStatusBadgeProps) {
  const { tt } = useI18n();
  return (
    <span
      className={`inline-flex min-w-[84px] items-center justify-center whitespace-nowrap rounded px-2 py-0.5 text-[12px] font-medium ${CLASSES[status]} ${className}`}
    >
      {tt(LABELS[status])}
    </span>
  );
}
