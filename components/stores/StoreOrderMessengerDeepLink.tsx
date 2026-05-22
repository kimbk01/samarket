"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildStoreOrderMessengerRoomHref } from "@/lib/chats/surfaces/order-chat-surface";
import {
  buildMessengerContextMetaFromStoreOrder,
  type StoreOrderMessengerContextInput,
} from "@/lib/community-messenger/store-order-messenger-context";

/** `store_orders.community_messenger_room_id` 가 있을 때 메신저 방으로 이동 (`context` 있으면 `?cm_ctx=` 동기화) */
export function StoreOrderMessengerDeepLink({
  roomId,
  className,
  variant = "default",
  context,
}: {
  roomId: string;
  /** 기본: 전폭 보조 버튼 */
  className?: string;
  /** `compact`: 목록 카드 등 짧은 라벨 */
  variant?: "default" | "compact";
  context?: StoreOrderMessengerContextInput | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = roomId.trim();
  if (!id) return null;
  const label =
    variant === "compact"
      ? "주문 채팅"
      : "주문 진행 채팅 열기";
  const returnHref = `${pathname ?? ""}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const href = buildStoreOrderMessengerRoomHref(
    id,
    context
      ? {
          contextMeta: buildMessengerContextMetaFromStoreOrder(context),
          returnHref,
        }
      : { returnHref }
  );
  return (
    <Link
      href={href}
      className={
        className ??
        "delivery-ui inline-flex w-full items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] px-3 py-3 text-sm font-bold text-[color:var(--delivery-primary)] shadow-none"
      }
    >
      {label}
    </Link>
  );
}
