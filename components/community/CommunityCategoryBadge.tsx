"use client";

export function CommunityCategoryBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 text-[11px] font-medium text-sam-fg">
      {label}
    </span>
  );
}
