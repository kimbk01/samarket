"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { fetchIntegratedChatRoomMessages } from "@/lib/chats/fetch-chat-room-messages-api";

type Props =
  | { variant: "buyer"; orderId: string }
  | { variant: "owner"; storeId: string; slug: string; orderId: string };

/**
 * 매장 주문 전용 URL에서 채팅방 ID를 조회한 뒤, **같은 페이지에서** `ChatRoomScreen`을 렌더합니다.
 * (`router.replace(/chats/…)` 제거 — 네비게이션·Suspense 이중 비용 절감)
 *
 * 부모에서 `key={orderId}`(또는 store+order)를 넘기면 주문 전환 시 이전 방 상태가 남지 않습니다.
 */
export function RedirectStoreOrderToUnifiedChat(props: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [resolvedRoomId, setResolvedRoomId] = useState<string | null>(null);
  const variant = props.variant;
  const orderId = props.orderId.trim();
  const storeId = variant === "owner" ? props.storeId.trim() : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (variant === "buyer") {
          if (!orderId) {
            if (!cancelled) setErr("주문을 찾을 수 없습니다.");
            return;
          }
          const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (cancelled) return;
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            chat_room_id?: string | null;
            order?: { order_status?: string };
          };
          if (cancelled) return;

          if (!res.ok || j?.ok === false) {
            if (res.status === 401 || j?.error === "unauthorized") {
              if (!cancelled) setErr("로그인이 필요합니다.");
              return;
            }
            if (res.status === 404 || j?.error === "not_found") {
              if (!cancelled) setErr("주문을 찾을 수 없습니다.");
              return;
            }
            if (res.status === 503 || j?.error === "supabase_unconfigured") {
              if (!cancelled) setErr("서버 설정(Supabase)이 필요합니다.");
              return;
            }
            if (!cancelled) setErr("주문 정보를 불러오지 못했습니다.");
            return;
          }

          const st = j?.order?.order_status;
          if (typeof st === "string" && isStoreOrderChatDisabledForBuyer(st)) {
            if (!cancelled) setErr("취소된 주문은 배달채팅을 열 수 없습니다.");
            return;
          }
          const rawRid = j?.chat_room_id;
          const rid = typeof rawRid === "string" && rawRid.trim() ? rawRid.trim() : null;
          if (rid) {
            void fetchIntegratedChatRoomMessages(rid);
            if (!cancelled) setResolvedRoomId(rid);
            return;
          }
          if (!cancelled) {
            setErr(
              "채팅방을 열 수 없습니다. DB에 store_order 채팅 스키마가 없거나 방 생성에 실패했을 수 있어요. Supabase 마이그레이션( chat_rooms.store_order ) 적용을 확인해 주세요."
            );
          }
          return;
        }

        if (!orderId || !storeId) {
          if (!cancelled) setErr("주문 또는 매장 정보가 없습니다.");
          return;
        }
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
          { credentials: "include", cache: "no-store" }
        );
        if (cancelled) return;
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          meta?: { chat_room_id?: string | null };
        };
        if (cancelled) return;

        if (!res.ok || j?.ok === false) {
          if (res.status === 401 || j?.error === "unauthorized") {
            if (!cancelled) setErr("로그인이 필요합니다.");
            return;
          }
          if (res.status === 404 || j?.error === "order_not_found") {
            if (!cancelled) setErr("주문을 찾을 수 없습니다.");
            return;
          }
          if (res.status === 503 || j?.error === "supabase_unconfigured") {
            if (!cancelled) setErr("서버 설정(Supabase)이 필요합니다.");
            return;
          }
          if (!cancelled) setErr("주문 정보를 불러오지 못했습니다.");
          return;
        }

        const rawRid = j?.meta?.chat_room_id;
        const rid = typeof rawRid === "string" && rawRid.trim() ? rawRid.trim() : null;
        if (rid) {
          void fetchIntegratedChatRoomMessages(rid);
          if (!cancelled) setResolvedRoomId(rid);
          return;
        }
        if (!cancelled) setErr("채팅방을 열 수 없습니다.");
      } catch {
        if (!cancelled) setErr("네트워크 오류가 발생했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, orderId, storeId]);

  if (resolvedRoomId) {
    const listHref =
      props.variant === "buyer"
        ? "/my/store-orders"
        : buildStoreOrdersHref({ storeId: props.storeId.trim(), orderId: props.orderId.trim() });
    return <ChatRoomScreen roomId={resolvedRoomId} listHref={listHref} />;
  }

  if (err) {
    const oid = props.orderId.trim();
    const backHref =
      props.variant === "buyer"
        ? oid
          ? `/my/store-orders/${encodeURIComponent(oid)}`
          : "/my/store-orders"
        : buildStoreOrdersHref({ storeId: props.storeId.trim(), orderId: props.orderId.trim() });
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
      <p className="text-sm text-[#8E8E8E]">채팅을 불러오는 중…</p>
    </div>
  );
}
