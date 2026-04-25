/**
 * 채팅방 생성/조회 API (서비스 롤)
 * - body: { productId: string } — 구매자는 세션
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { enforceTradeChatCreateRoomQuota } from "@/lib/security/rate-limit-presets";
import { resolveLegacyProductChatCreateOrGet } from "@/lib/chat-domain/use-cases/legacy-product-chat-create-or-get";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(userId);
  if (!phone.ok) return phone.response;

  const createRl = await enforceTradeChatCreateRoomQuota(userId);
  if (!createRl.ok) return createRl.response;
  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  const resolved = await resolveLegacyProductChatCreateOrGet({ userId, productId });
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({
    ok: true,
    roomId: resolved.roomId,
    messengerRoomId: resolved.messengerRoomId,
  });
}
