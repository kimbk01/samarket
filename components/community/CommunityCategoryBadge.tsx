"use client";

export function CommunityCategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800">
      {label}
    </span>
  );
}
