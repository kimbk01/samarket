"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OwnerOrderDetail } from "./OwnerOrderDetail";
import { fetchOwnerOrderRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { useMeStoreBySlug } from "@/hooks/useMeStoreBySlug";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { useSupabaseStoreOrderRowRealtime } from "@/hooks/useSupabaseStoreOrderRowRealtime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

export function OwnerOrderDetailPageClient({ slug, orderId }: { slug: string; orderId: string }) {
  const { t } = useI18n();
  const { state: gate } = useMeStoreBySlug(slug);
  const [order, setOrder] = useState<OwnerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const safeSlug = decodeURIComponent(slug || "").trim();
  const safeOrderId = decodeURIComponent(orderId || "").trim();
  const storeId = gate.kind === "ok" ? gate.store.id : null;
  const storeName = gate.kind === "ok" ? gate.store.store_name : "";

  const load = useCallback(async () => {
    if (!storeId || !safeOrderId) return;
    setLoading((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const r = await fetchOwnerOrderRemote(storeId, safeOrderId, {
        storeSlug: safeSlug,
        storeName,
      });
      if (!r.ok) {
        setOrder((prev) => (prev === null ? prev : null));
        setError(r.error);
        return;
      }
      setOrder(r.order);
    } catch {
      setOrder((prev) => (prev === null ? prev : null));
      setError("network_error");
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [storeId, safeOrderId, safeSlug, storeName]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupabaseStoreOrderRowRealtime(storeId && safeOrderId ? safeOrderId : null, {
    debounceMs: 380,
    onChange: () => void load(),
  });

  if (gate.kind === "loading" || gate.kind === "idle") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-muted">{t("common_loading")}</div>
    );
  }
  if (gate.kind === "unauth") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-fg">
        <Link href="/login" className="font-semibold text-signature underline">
          {t("common_login")}
        </Link>
      </div>
    );
  }
  if (gate.kind === "not_owner") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-fg">
        {t("store_owner_no_permission")}
        <Link href={`/stores/${encodeURIComponent(safeSlug)}`} className="mt-4 block text-signature underline">
          {t("store_owner_back_to_store")}
        </Link>
      </div>
    );
  }
  if (gate.kind === "error") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-rose-800">
        {gate.message}
      </div>
    );
  }

  if (gate.kind !== "ok") {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-muted">{t("business_phase7_262")}</div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center">
        <p className="text-sm text-sam-muted">
          {error ? resolveOwnerApiErrorMessage(error, t) : t("store_owner_order_not_found")}
        </p>
        <Link
          href={buildStoreOrdersHref({ storeId: gate.store.id })}
          className="mt-4 inline-block text-sm font-semibold text-signature underline"
        >
          {t("store_owner_back_to_list")}
        </Link>
      </div>
    );
  }

  return (
    <OwnerOrderDetail
      storeId={gate.store.id}
      slug={safeSlug}
      order={order}
      onActionDone={() => void load()}
    />
  );
}
