import type { MessageKey } from "@/lib/i18n/message-key";

/** 매장 표시 상태 — 배달 탭 카드·앱 홈 매장 칸 공통 */
export type StoreDisplayStatus = "open" | "preparing" | "closed" | "resting";

/** 상태 문구 키 — 단일 정의 (배달 탭 `StoreDeliveryRowCard` 와 같은 문구, 감사 중복 2026-11-09) */
export function storeDisplayStatusLabelKey(status: StoreDisplayStatus | string): MessageKey {
  if (status === "open") return "store_open_now";
  if (status === "resting") return "store_resting_now";
  if (status === "closed") return "store_closed_now";
  return "store_preparing";
}
