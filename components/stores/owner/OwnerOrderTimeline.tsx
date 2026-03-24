"use client";

import type { OwnerOrderLog } from "@/lib/store-owner/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OwnerOrderTimeline({ logs }: { logs: OwnerOrderLog[] }) {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-500">이력이 없습니다.</p>;
  }
  return (
    <ol className="relative space-y-0 border-l-2 border-gray-200 pl-4">
      {sorted.map((l) => (
        <li key={l.id} className="mb-4 ml-1 last:mb-0">
          <span className="absolute -left-[9px] mt-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-gray-400" />
          <p className="text-xs text-gray-500">{fmt(l.created_at)}</p>
          <p className="text-sm font-semibold text-gray-900">{l.message ?? "상태 변경"}</p>
          <p className="text-xs text-gray-500">
            {l.actor_name} ({l.actor_type})
            {l.from_status && l.to_status ? (
              <>
                {" "}
                · {l.from_status} → {l.to_status}
              </>
            ) : null}
          </p>
          {l.memo ? <p className="mt-1 text-xs text-gray-600">메모: {l.memo}</p> : null}
        </li>
      ))}
    </ol>
  );
}
