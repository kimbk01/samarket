import { redirectLegacyOwnerPage } from "@/lib/business/redirect-legacy-owner-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy Owner order chat (id 없음) — redirect-only.
 * `?orderId=` / `?order_id=` → `/stores/owner/order-chat/[orderId]`, 없으면 주문 채팅 목록.
 */
export default async function LegacyOwnerOrderChatIndexRedirectPage({ searchParams }: PageProps) {
  return redirectLegacyOwnerPage("/my/business/store-order-chat", searchParams);
}
