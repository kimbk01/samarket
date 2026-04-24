"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OwnerOrderDetail } from "./OwnerOrderDetail";
import { fetchOwnerOrderRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { useMeStoreBySlug } from "@/hooks/useMeStoreBySlug";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

export function OwnerOrderDetailPageClient({ slug, orderId }: { slug: string; orderId: string }) {
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
    setLoading(true);
    setError(null);
    try {
      const r = await fetchOwnerOrderRemote(storeId, safeOrderId, {
        storeSlug: safeSlug,
        storeName,
      });
      if (!r.ok) {
        setOrder(null);
        setError(r.error);
        return;
      }
      setOrder(r.order);
    } catch {
      setOrder(null);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [storeId, safeOrderId, safeSlug, storeName]);

  useEffect(() => {
    void load();
  }, [load]);

  if (gate.kind === "loading" || gate.kind === "idle") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-muted">불러오는 중…</div>
    );
  }
  if (gate.kind === "unauth") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-fg">
        <Link href="/login" className="font-semibold text-signature underline">
          로그인
        </Link>
      </div>
    );
  }
  if (gate.kind === "not_owner") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-fg">
        오너 권한이 없습니다.
        <Link href={`/stores/${encodeURIComponent(safeSlug)}`} className="mt-4 block text-signature underline">
          매장으로
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
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center text-sm text-sam-muted">주문 불러오는 중…</div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-16 text-center">
        <p className="text-sm text-sam-muted">{error ?? "주문을 찾을 수 없습니다."}</p>
        <Link
          href={buildStoreOrdersHref({ storeId: gate.store.id })}
          className="mt-4 inline-block text-sm font-semibold text-signature underline"
        >
          목록으로
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
