"use client";

interface CategoryStatusBadgeProps {
  isActive: boolean;
}

export function CategoryStatusBadge({ isActive }: CategoryStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[12px] font-medium ${
        isActive ? "bg-green-100 text-green-800" : "bg-sam-border-soft text-sam-muted"
      }`}
    >
      {isActive ? "사용" : "미사용"}
    </span>
  );
}
