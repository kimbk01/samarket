"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";
import { ownerRequestStatusLabelKey } from "@/lib/platform-event-owner-requests/types";

type Props = { storeId: string };

export function OwnerEventPromotionListClient({ storeId }: Props) {
  const { safeT } = useI18n();
  const [items, setItems] = useState<PlatformEventOwnerRequestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/me/event-promotion-requests?storeId=${encodeURIComponent(storeId)}`,
        { credentials: "same-origin" }
      );
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
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/event-promotion-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request?: PlatformEventOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.request) {
        setError(json.error || "create_failed");
        return;
      }
      window.location.href = `/stores/owner/ads/event-promotions/${encodeURIComponent(json.request.id)}`;
    } catch {
      setError("create_failed");
    } finally {
      setBusy(false);
    }
  }, [storeId]);

  return (
    <div className="space-y-4 p-4" data-owner-event-promo-list="1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {safeT("owner_event_promo_title", {
            fallbackKo: "프로모션",
            fallbackEn: "Promotions",
          })}
        </h1>
        <button
          type="button"
          disabled={busy}
          className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
          onClick={() => void createDraft()}
        >
          {safeT("owner_event_promo_create", {
            fallbackKo: "새 신청",
            fallbackEn: "New request",
          })}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {items.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("owner_event_promo_empty", {
            fallbackKo: "신청 내역이 없습니다.",
            fallbackEn: "No promotion requests yet.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/stores/owner/ads/event-promotions/${encodeURIComponent(item.id)}`}
                className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <span className="font-medium">{item.title || "—"}</span>
                <span className="text-sam-muted">
                  {safeT(ownerRequestStatusLabelKey(item.requestStatus) as never, {
                    fallbackKo:
                      item.requestStatus === "draft"
                        ? "작성 중"
                        : item.requestStatus === "approved"
                          ? "승인"
                          : item.requestStatus === "rejected"
                            ? "반려"
                            : item.requestStatus === "cancelled"
                              ? "취소"
                              : item.requestStatus === "revision_required"
                                ? "수정 요청"
                                : "검토 중",
                    fallbackEn: item.requestStatus,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
