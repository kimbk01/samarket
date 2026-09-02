"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

export function AdminPlatformPopupRequestQueue() {
  const { safeT } = useI18n();
  const [items, setItems] = useState<PlatformPopupOwnerRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/platform-popup-requests?status=open", {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: PlatformPopupOwnerRequestRow[];
      error?: string;
    };
    if (!res.ok || !json.ok) {
      setError(json.error || "load_failed");
      setItems([]);
    } else {
      setItems(json.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-admin-platform-popup-request-queue="1">
    <AdminCard>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-sam-fg">
          {safeT("admin_platform_popup_requests_title", {
            fallbackKo: "오너 팝업 신청",
            fallbackEn: "Owner popup requests",
          })}
        </h2>
        <button
          type="button"
          className="rounded border border-sam-border px-2 py-1 text-xs"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_platform_popup_loading", {
            fallbackKo: "불러오는 중…",
            fallbackEn: "Loading…",
          })}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-sam-muted">
          {safeT("admin_platform_popup_requests_empty", {
            fallbackKo: "대기 중인 오너 신청이 없습니다.",
            fallbackEn: "No open owner requests.",
          })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-sam-border text-sam-muted">
              <tr>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Payment</th>
                <th className="px-2 py-2">Store</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Surfaces</th>
                <th className="px-2 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sam-border/60 hover:bg-sam-app/60">
                  <td className="px-2 py-2">
                    <Link
                      href={PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.detail(item.id)}
                      className="font-medium uppercase text-sam-brand underline-offset-2 hover:underline"
                    >
                      {item.requestStatus}
                    </Link>
                  </td>
                  <td className="px-2 py-2 uppercase">{item.paymentStatus}</td>
                  <td className="px-2 py-2 font-mono text-xs">{item.storeId.slice(0, 8)}</td>
                  <td className="px-2 py-2">
                    {item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}
                  </td>
                  <td className="px-2 py-2">{item.requestedSurfaces.join(", ")}</td>
                  <td className="px-2 py-2 text-xs">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
    </div>
  );
}
