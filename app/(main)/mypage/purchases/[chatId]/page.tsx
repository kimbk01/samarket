import { redirect } from "next/navigation";
import { resolveLegacyPurchaseDetailRedirectHref } from "@/lib/mypage/legacy-purchase-detail-redirect-server";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

/** CUT E — legacy purchase detail → Messenger trade room (buyer actions stay in room). */
export default async function PurchaseDetailLegacyRedirectPage({ params }: PageProps) {
  const { chatId: raw } = await params;
  /** 정규 메신저 방 id 우선 — 없을 때만 product_chats.id 경로 (lib/mypage/legacy-purchase-detail-redirect-server.ts) */
  redirect(await resolveLegacyPurchaseDetailRedirectHref(raw));
}
