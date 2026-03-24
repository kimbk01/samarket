"use client";

import type { ModerationStatus } from "@/lib/types/report";

const LABELS: Record<ModerationStatus, string> = {
  normal: "정상",
  warned: "경고",
  suspended: "일시정지",
  banned: "영구정지",
};

const CLASSES: Record<ModerationStatus, string> = {
  normal: "bg-emerald-50 text-emerald-800",
  warned: "bg-amber-100 text-amber-800",
  suspended: "bg-orange-100 text-orange-800",
  banned: "bg-red-50 text-red-700",
};

interface AdminModerationStatusBadgeProps {
  status: ModerationStatus;
  className?: string;
}

export function AdminModerationStatusBadge({
  status,
  className = "",
}: AdminModerationStatusBadgeProps) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${CLASSES[status]} ${className}`}
    >
      {LABELS[status]}
    </span>
  );
}
