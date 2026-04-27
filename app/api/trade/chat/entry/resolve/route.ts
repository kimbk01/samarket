import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveTradeChatEntry } from "@/lib/chat-domain/use-cases/trade-chat-entry-resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EntryResolveBody = {
  productId?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: EntryResolveBody;
  try {
    body = (await req.json()) as EntryResolveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ ok: false, error: "productId 필요" }, { status: 400 });
  }

  const result = await resolveTradeChatEntry(req, auth.userId, productId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status >= 400 ? result.status : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    roomId: result.roomId,
    roomSource: result.roomSource,
    ...(result.messengerRoomId ? { messengerRoomId: result.messengerRoomId } : {}),
  });
}
