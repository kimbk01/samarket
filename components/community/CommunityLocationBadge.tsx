"use client";

export function CommunityLocationBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
      {label}
    </span>
  );
}
