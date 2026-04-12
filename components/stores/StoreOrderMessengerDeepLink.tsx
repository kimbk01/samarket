"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildCommunityMessengerRoomUrlWithContext } from "@/lib/community-messenger/cm-ctx-url";
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
  const { t } = useI18n();
  const id = roomId.trim();
  if (!id) return null;
  const label =
    variant === "compact"
      ? t("nav_messenger_open_store_order_short")
      : t("nav_messenger_open_store_order");
  const href = context
    ? buildCommunityMessengerRoomUrlWithContext(id, buildMessengerContextMetaFromStoreOrder(context))
    : `/community-messenger/rooms/${encodeURIComponent(id)}`;
  return (
    <Link
      href={href}
      className={
        className ??
        "inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-sm font-semibold text-sam-fg shadow-sm"
      }
    >
      {label}
    </Link>
  );
}
