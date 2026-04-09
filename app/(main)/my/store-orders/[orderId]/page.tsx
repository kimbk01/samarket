"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MyStoreOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";

  useEffect(() => {
    if (!orderId) return;
    router.replace(`/mypage/store-orders/${encodeURIComponent(orderId)}`);
  }, [orderId, router]);

  return null;
}
