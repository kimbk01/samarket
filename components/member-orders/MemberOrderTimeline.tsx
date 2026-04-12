"use client";

import type { MemberOrderLog } from "@/lib/member-orders/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MemberOrderTimeline({ logs }: { logs: MemberOrderLog[] }) {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return (
    <ol className="relative space-y-0 border-l-2 border-sam-border pl-4">
      {sorted.map((l) => (
        <li key={l.id} className="mb-4 ml-1 last:mb-0">
          <span className="absolute -left-[9px] mt-1.5 h-3 w-3 rounded-full bg-sam-surface ring-2 ring-sam-border" />
          <p className="text-xs text-sam-muted">{fmt(l.created_at)}</p>
          <p className="text-sm font-medium text-sam-fg">{l.message}</p>
        </li>
      ))}
    </ol>
  );
}
