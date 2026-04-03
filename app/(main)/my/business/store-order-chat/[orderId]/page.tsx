"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

export default function OwnerStoreOrderChatBridgePage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId.trim() : "";
  const [ctx, setCtx] = useState<{ store_id: string; slug: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/me/owner-store-order-context?order_id=${encodeURIComponent(orderId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        store_id?: string;
        slug?: string;
        error?: string;
      };
      if (cancelled) return;
      if (!res.ok || j?.ok !== true || typeof j.store_id !== "string") {
        setErr(typeof j?.error === "string" ? j.error : "load_failed");
        return;
      }
      setCtx({ store_id: j.store_id, slug: typeof j.slug === "string" ? j.slug : "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-gray-700">
        <p>주문 ID가 없습니다.</p>
        <Link href="/my/business" className="font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }

  if (err) {
    const orderBackHref =
      ctx?.store_id != null
        ? buildStoreOrdersHref({ storeId: ctx.store_id, orderId })
        : "/my/business";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-gray-700">
        <p>채팅을 열 수 없습니다. ({err})</p>
        <Link href={orderBackHref} className="font-medium text-signature underline">
          {ctx?.store_id != null ? "주문 관리" : "매장 어드민"}
        </Link>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4">
        <p className="text-sm text-gray-500">채팅을 불러오는 중…</p>
      </div>
    );
  }

  return (
    <RedirectStoreOrderToUnifiedChat
      key={`${ctx.store_id}:${orderId}`}
      variant="owner"
      storeId={ctx.store_id}
      slug={ctx.slug}
      orderId={orderId}
    />
  );
}
