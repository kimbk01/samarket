"use client";

import { useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { invalidateMeStoresListDedupedCache } from "@/lib/me/fetch-me-stores-deduped";

export function BusinessAdminOpenToggle({
  row,
  onUpdated,
}: {
  row: StoreRow;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isOpen = row.is_open !== false;

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_open: !isOpen }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (j?.ok) {
        invalidateMeStoresListDedupedCache();
        onUpdated();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="sam-text-helper font-medium text-sam-muted">영업</span>
      <button
        type="button"
        role="switch"
        aria-checked={isOpen}
        disabled={busy || String(row.approval_status) !== "approved"}
        onClick={() => void toggle()}
        title={isOpen ? "일시중지(접수 제한)" : "영업 시작"}
        className={`relative h-8 w-[52px] shrink-0 rounded-full transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-signature disabled:opacity-50 ${
          isOpen ? "bg-emerald-500" : "bg-sam-surface-muted"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-sam-surface shadow transition ${
            isOpen ? "left-7" : "left-1"
          }`}
        />
      </button>
      <span className={`sam-text-helper font-semibold ${isOpen ? "text-emerald-800" : "text-sam-muted"}`}>
        {isOpen ? "영업중" : "일시중지"}
      </span>
    </div>
  );
}
