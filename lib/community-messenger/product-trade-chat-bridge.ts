/**
 * 중고 거래채팅(product_chats / 통합 item_trade) → 커뮤니티 메신저 1:1 + 거래 메타.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

export async function createCommunityMessengerDeepLinkFromProductTradeChat(
  tradeChatRoomId: string
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const rid = tradeChatRoomId.trim();
  if (!rid) return { ok: false, error: "bridge_failed" };
  return runSingleFlight(`cm:bridge-product-chat:${rid}`, async () => {
    const res = await fetch("/api/community-messenger/bridge/product-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roomId: rid }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      href?: string;
      code?: string;
      error?: string;
    };
    if (!res.ok || json.ok !== true || typeof json.href !== "string") {
      const code = typeof json.code === "string" ? json.code : "bridge_failed";
      return { ok: false, error: code };
    }
    return { ok: true, href: json.href };
  });
}
