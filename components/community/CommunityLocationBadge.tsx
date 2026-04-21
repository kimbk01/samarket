"use client";

export function CommunityLocationBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-ui-rect bg-emerald-50 px-2 py-0.5 sam-text-xxs font-medium text-emerald-900">
      {label}
    </span>
  );
}
