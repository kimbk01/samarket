"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerStoreOrderDeliveryActionsChatToolbar } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";

type Snap = {
  order_no: string;
  order_status: string;
  fulfillment_type: string;
};

export function OwnerStoreOrderModalSellerToolbar({
  storeId,
  orderId,
  onRoomReload,
}: {
  storeId: string;
  orderId: string;
  onRoomReload?: () => void;
}) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sid = storeId.trim();
    const oid = orderId.trim();
    if (!sid || !oid) {
      setSnap(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(sid)}/orders/${encodeURIComponent(oid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        order?: Record<string, unknown>;
      };
      if (!res.ok || !j?.ok || !j.order) {
        setSnap(null);
        return;
      }
      const o = j.order;
      setSnap({
        order_no: typeof o.order_no === "string" ? o.order_no : "—",
        order_status: String(o.order_status ?? ""),
        fulfillment_type: String(o.fulfillment_type ?? "pickup"),
      });
    } catch {
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpdated = useCallback(() => {
    void load();
    onRoomReload?.();
  }, [load, onRoomReload]);

  if (!storeId.trim() || !orderId.trim()) return null;

  if (loading && !snap) {
    return (
      <div className="shrink-0 border-b border-sam-border bg-background px-3 py-2">
        <p className="text-center sam-text-helper text-muted">주문 상태 불러오는 중…</p>
      </div>
    );
  }

  if (!snap) return null;

  return (
    <OwnerStoreOrderDeliveryActionsChatToolbar
      storeId={storeId.trim()}
      order={{
        id: orderId.trim(),
        order_status: snap.order_status,
        fulfillment_type: snap.fulfillment_type,
      }}
      orderNo={snap.order_no}
      onUpdated={onUpdated}
    />
  );
}
