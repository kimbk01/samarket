"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";

type Props =
  | { variant: "buyer"; orderId: string }
  | { variant: "owner"; storeId: string; slug: string; orderId: string };

/**
 * 배달 주문 전용 URL → 통합 채팅 `/chats/[chatRoomId]` 로 이동 (DB `chat_rooms.store_order`)
 */
export function RedirectStoreOrderToUnifiedChat(props: Props) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const variant = props.variant;
  const orderId = props.orderId;
  const storeId = variant === "owner" ? props.storeId : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (variant === "buyer") {
          const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
            credentials: "include",
            cache: "no-store",
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            chat_room_id?: string | null;
            order?: { order_status?: string };
          };
          if (cancelled) return;
          if (!res.ok || j?.ok === false) {
            if (res.status === 401 || j?.error === "unauthorized") {
              setErr("로그인이 필요합니다.");
              return;
            }
            if (res.status === 404 || j?.error === "not_found") {
              setErr("주문을 찾을 수 없습니다.");
              return;
            }
            if (res.status === 503 || j?.error === "supabase_unconfigured") {
              setErr("서버 설정(Supabase)이 필요합니다.");
              return;
            }
          }
          const st = j?.order?.order_status;
          if (typeof st === "string" && isStoreOrderChatDisabledForBuyer(st)) {
            setErr("취소된 주문은 배달채팅을 열 수 없습니다.");
            return;
          }
          const rid = typeof j?.chat_room_id === "string" && j.chat_room_id ? j.chat_room_id : null;
          if (rid) {
            router.replace(`/chats/${encodeURIComponent(rid)}`);
            return;
          }
          setErr(
            "채팅방을 열 수 없습니다. DB에 store_order 채팅 스키마가 없거나 방 생성에 실패했을 수 있어요. Supabase 마이그레이션( chat_rooms.store_order ) 적용을 확인해 주세요."
          );
          return;
        }
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
          { credentials: "include", cache: "no-store" }
        );
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rid = typeof j?.meta?.chat_room_id === "string" ? j.meta.chat_room_id : null;
        if (rid) {
          router.replace(`/chats/${encodeURIComponent(rid)}`);
          return;
        }
        setErr("채팅방을 열 수 없습니다.");
      } catch {
        if (!cancelled) setErr("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, variant, orderId, storeId]);

  if (err) {
    const backHref =
      props.variant === "buyer"
        ? `/my/store-orders/${encodeURIComponent(props.orderId)}`
        : buildStoreOrdersHref({ storeId: props.storeId, orderId: props.orderId });
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <p className="text-sm text-gray-700">{err}</p>
        <Link href={backHref} className="text-sm font-medium text-signature underline">
          주문 상세로 돌아가기
        </Link>
        <Link
          href={props.variant === "buyer" ? "/my/store-orders" : "/mypage/trade/chat"}
          className="text-sm text-gray-600 underline"
        >
          주문 채팅 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 px-4">
      <p className="text-sm text-[#8E8E8E]">채팅으로 연결하는 중…</p>
    </div>
  );
}
