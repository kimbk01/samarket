"use client";

export function MeetingStatusBadge({ status }: { status: string }) {
  const s = status.trim().toLowerCase();
  const cls =
    s === "open"
      ? "bg-emerald-50 text-emerald-900"
      : s === "ended" || s === "cancelled"
        ? "bg-gray-100 text-gray-600"
        : "bg-amber-50 text-amber-900";
  return <span className={`rounded-ui-rect px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}
