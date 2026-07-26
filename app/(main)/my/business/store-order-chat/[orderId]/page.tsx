import { redirect } from "next/navigation";
import { mapLegacyOwnerPath } from "@/lib/business/owner-routes";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

/** Legacy Owner order chat — redirect-only to canonical owner order-chat. */
export default async function LegacyOwnerOrderChatRedirectPage({ params }: PageProps) {
  const { orderId } = await params;
  const id = typeof orderId === "string" ? orderId.trim() : "";
  redirect(mapLegacyOwnerPath(`/my/business/store-order-chat/${id}`));
}
