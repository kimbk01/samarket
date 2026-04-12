"use client";

/** 당근형: 상품 상태 뱃지 (sale=active, reserved, sold, hidden) */
const STATUS_LABEL: Record<string, string> = {
  active: "판매중",
  sale: "판매중",
  reserved: "예약중",
  sold: "거래완료",
  hidden: "숨김",
  deleted: "삭제됨",
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
  const label = STATUS_LABEL[status] ?? status;
  const cls = STATUS_CLASS[status] ?? "bg-sam-surface-muted text-sam-fg";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls} ${className}`}>
      {label}
    </span>
  );
}
