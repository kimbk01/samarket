import { redirect } from "next/navigation";
import { appendOwnerSearchParams, OwnerRoutes } from "@/lib/business/owner-routes";

type PageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner order chat — redirect-only to canonical owner order-chat (쿼리 보존). */
export default async function LegacyOwnerOrderChatRedirectPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const sp = await searchParams;
  const id = typeof orderId === "string" ? orderId.trim() : "";
  redirect(appendOwnerSearchParams(id ? OwnerRoutes.orderChat(id) : OwnerRoutes.orderChats(), sp));
}
