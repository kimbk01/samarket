"use client";

import { useEffect, useState } from "react";
import type { PointPromotionOrder } from "@/lib/types/point";

export function useActivePointPromotionOrders(): PointPromotionOrder[] {
  const [orders, setOrders] = useState<PointPromotionOrder[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exposure/point-promotion-orders", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          orders?: PointPromotionOrder[];
        };
        if (!cancelled && json.ok) {
          setOrders(json.orders ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return orders;
}
