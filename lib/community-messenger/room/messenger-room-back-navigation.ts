import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import {
  resolveStoreOrderBuyerMessengerRoomBackHref,
  type StoreOrderBuyerMessengerRoomBackInput,
} from "@/lib/store-order-chat/store-order-buyer-messenger-room-back";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

export type MessengerRoomBackNavigationPlan = {
  href: string;
  /** true면 `router.replace` 로만 이동(히스토리 back 미사용) */
  forceDirect: boolean;
};

type RoomBackOverride = MessengerRoomBackNavigationPlan;

const overrides = new Map<string, RoomBackOverride>();

export function setMessengerRoomBackOverride(roomId: string, plan: RoomBackOverride | null): void {
  const id = roomId.trim();
  if (!id) return;
  if (plan == null) {
    overrides.delete(id);
    return;
  }
  overrides.set(id, plan);
}

export function getMessengerRoomBackOverride(roomId: string): RoomBackOverride | null {
  const id = roomId.trim();
  if (!id) return null;
  return overrides.get(id) ?? null;
}

export function resolveMessengerRoomBackNavigation(args: {
  roomId: string;
  searchParams: { get: (key: string) => string | null };
  buyerBack?: StoreOrderBuyerMessengerRoomBackInput | null;
}): MessengerRoomBackNavigationPlan {
  const override = getMessengerRoomBackOverride(args.roomId);
  if (override) return override;

  const buyerHref =
    args.buyerBack ?
      resolveStoreOrderBuyerMessengerRoomBackHref(args.buyerBack)
    : null;
  if (buyerHref) {
    return { href: buyerHref, forceDirect: true };
  }

  return {
    href: buildMessengerRoomListBackHref(args.searchParams),
    forceDirect: false,
  };
}

export function runMessengerRoomBackNavigation(
  router: {
    back: () => void;
    push: (href: string) => void;
    replace: (href: string, options?: { scroll?: boolean }) => void;
  },
  plan: MessengerRoomBackNavigationPlan
): void {
  if (plan.forceDirect) {
    router.replace(plan.href, { scroll: false });
    return;
  }
  runHistoryBackWithFallback(router, plan.href);
}
