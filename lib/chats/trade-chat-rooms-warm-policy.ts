import { isDeliveryConsumerBottomNavSurface } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";

function normalizeClientPath(pathname: string | null | undefined): string {
  const raw = (pathname ?? "").split("?")[0]?.trim() ?? "";
  return raw.replace(/\/+$/, "") || "/";
}

/**
 * `/stores`·배달 소비자 셸에서는 trade room list preload 금지.
 * ChatRoomList 마운트(명시적 trade 채팅 화면)는 이 정책 밖 — warm/prefetch 전용.
 */
export function shouldPreloadTradeChatRoomsOnClient(pathname?: string | null): boolean {
  const p =
    typeof pathname === "string" ?
      normalizeClientPath(pathname)
    : typeof window !== "undefined" ?
      normalizeClientPath(window.location.pathname)
    : "";
  if (!p) return true;
  if (mainBottomNavPrefetchTriggerKey(p) === "stores") return false;
  if (isDeliveryConsumerBottomNavSurface(p)) return false;
  return true;
}
