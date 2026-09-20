"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";

export function AdminPlatformEventOwnerRequestQueueClient() {
  const { safeT } = useI18n();
  const [items, setItems] = useState<PlatformEventOwnerRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/platform-event-owner-requests", {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: PlatformEventOwnerRequestRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setError("load_failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-event-owner-request-queue="1">
      <h1 className="text-lg font-semibold">
        {safeT("admin_event_owner_requests_title", {
          fallbackKo: "오너 프로모션 신청",
          fallbackEn: "Owner promotion requests",
        })}
      </h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/admin/platform-event-owner-requests/${encodeURIComponent(item.id)}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
            >
              <span className="font-medium">{item.title || "—"}</span>
              <span className="text-sam-muted">
                {item.requestStatus} · store {item.storeId.slice(0, 8)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
