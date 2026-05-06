"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Sam } from "@/lib/ui/sam-component-classes";

type DeliveryRow = {
  order_id: string;
  delivery_status: string;
  assigned_at?: string | null;
  updated_at?: string | null;
};

type OrderRow = {
  id?: string;
  order_no?: string;
  order_status?: string;
};

export function RiderOrdersClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<string | null>(null);
  const [rows, setRows] = useState<{ delivery: DeliveryRow; order: OrderRow }[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/me/rider/orders", { cache: "no-store" });
    const j = (await r.json()) as {
      ok?: boolean;
      error?: string;
      rider?: { id: string };
      orders?: { delivery: DeliveryRow; order: OrderRow }[];
    };
    if (!r.ok || !j.ok) {
      setErr(j.error ?? "목록 실패");
      return;
    }
    setRiderId(j.rider?.id ?? null);
    setRows(Array.isArray(j.orders) ? j.orders : []);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    const t = window.setInterval(() => void load(), 28_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    if (!riderId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const ch = sb
      .channel(`rider_orders_${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_order_deliveries",
          filter: `rider_id=eq.${riderId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [riderId, load]);

  const { queue, active, done } = useMemo(() => {
    const q: typeof rows = [];
    const a: typeof rows = [];
    const d: typeof rows = [];
    for (const x of rows) {
      const st = x.delivery.delivery_status;
      if (st === "rider_assigned") q.push(x);
      else if (st === "pickup_in_progress" || st === "delivering") a.push(x);
      else if (st === "delivered") d.push(x);
    }
    return { queue: q, active: a, done: d.slice(0, 30) };
  }, [rows]);

  if (loading) {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] flex items-center justify-center text-sam-muted`}>
        불러오는 중…
      </div>
    );
  }

  if (err === "rider_profile_not_found") {
    return (
      <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-8`}>
        <p className="text-sam-muted">라이더 프로필이 없습니다.</p>
        <Link href="/rider" className={`mt-4 inline-flex ${Sam.btn.secondary}`}>
          돌아가기
        </Link>
      </div>
    );
  }

  const OrderCard = ({ item }: { item: (typeof rows)[number] }) => {
    const oid = item.delivery.order_id;
    const no = item.order.order_no ?? oid.slice(0, 8);
    return (
      <Link
        href={`/rider/orders/${encodeURIComponent(oid)}`}
        className={`block ${Sam.card.base} ${Sam.card.pad} transition-colors`}
      >
        <div className="flex justify-between gap-2">
          <span className="font-medium text-sam-fg">{no}</span>
          <span className="text-xs text-sam-muted">{item.delivery.delivery_status}</span>
        </div>
        <p className={`mt-1 text-xs ${Sam.text.bodySecondary}`}>주문 상태: {item.order.order_status ?? "—"}</p>
      </Link>
    );
  };

  const Section = ({ title, items }: { title: string; items: typeof rows }) => (
    <section className="space-y-2">
      <h2 className={Sam.text.sectionTitle}>{title}</h2>
      {items.length === 0 ? <p className={`${Sam.text.bodySecondary} text-sm`}>없음</p> : null}
      <div className="space-y-2">
        {items.map((it) => (
          <OrderCard key={`${it.delivery.order_id}-${it.delivery.delivery_status}`} item={it} />
        ))}
      </div>
    </section>
  );

  return (
    <div className={`${Sam.page} bg-sam-app min-h-[70vh] px-4 py-6 max-w-lg mx-auto space-y-8`}>
      <header className="flex items-center justify-between gap-2">
        <h1 className={Sam.text.pageTitle}>배달 주문</h1>
        <Link href="/rider" className={`${Sam.btn.secondary} text-sm`}>
          홈
        </Link>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <Section title="대기 · 수락 필요" items={queue} />
      <Section title="진행 중" items={active} />
      <Section title="최근 완료" items={done} />
    </div>
  );
}
