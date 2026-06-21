import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { isStoreOrderTerminalStatus } from "@/lib/stores/store-order-process-model";

const BADGE_BASE =
  "inline-block max-w-full truncate whitespace-nowrap rounded-[6px] px-1.5 py-px sam-text-xxs font-semibold leading-none";

const PROGRESS_BADGE = `${BADGE_BASE} border border-[#006241] bg-white text-[#006241]`;
const ACTIVE_BADGE = `${BADGE_BASE} bg-[#006241] text-white`;
const WAITING_BADGE = `${BADGE_BASE} border border-[#FACC15] bg-[#FFF7E6] text-[#A16207]`;
const COMPLETED_BADGE = `${BADGE_BASE} border border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]`;
const CANCELLED_BADGE = `${BADGE_BASE} border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]`;

function badgeClassForOrderStatus(raw: string): string {
  const s = raw.trim();
  if (!s) return PROGRESS_BADGE;
  if (s === "completed") return COMPLETED_BADGE;
  if (isStoreOrderTerminalStatus(s)) return CANCELLED_BADGE;
  if (s === "pending") return WAITING_BADGE;
  if (s === "delivering" || s === "arrived") return ACTIVE_BADGE;
  return PROGRESS_BADGE;
}

export function deliveryChatListStatusBadgePresentation(
  orderStatusRaw: string,
  fulfillmentType: string
): { label: string; className: string } {
  const raw = orderStatusRaw.trim();
  const label = raw ? buyerOrderStatusLabel(raw, undefined, fulfillmentType) : "";
  return {
    label: label.trim() || raw,
    className: badgeClassForOrderStatus(raw),
  };
}
