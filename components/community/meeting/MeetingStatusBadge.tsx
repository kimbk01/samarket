"use client";

export function MeetingStatusBadge({ status }: { status: string }) {
  const s = status.trim().toLowerCase();
  const cls =
    s === "open"
      ? "bg-emerald-50 text-emerald-900"
      : s === "ended" || s === "cancelled"
        ? "bg-sam-surface-muted text-sam-muted"
        : "bg-amber-50 text-amber-900";
  return <span className={`rounded-ui-rect px-2 py-0.5 sam-text-xxs font-medium ${cls}`}>{status}</span>;
}
