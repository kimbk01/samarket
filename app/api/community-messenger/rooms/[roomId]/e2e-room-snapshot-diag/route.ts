import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { runCommunityMessengerRoomTradeDiagnosticsParallelForE2e } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * E2E 전용: RSC 첫 응답과 분리해 trade `chatRoomDetailLoad` 진단만 채운다(비프로덕션 + 진단 쿠키/헤더).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const jar = await cookies();
  const hdrs = await headers();
  const e2eRoomTrace =
    process.env.NODE_ENV !== "production" &&
    (jar.get("samarket_e2e_room_diag")?.value === "1" ||
      (hdrs.get("x-samarket-e2e-room-diag") ?? "").trim() === "1");
  if (!e2eRoomTrace) {
    return NextResponse.json({ ok: false, error: "e2e_room_diag_required" }, { status: 403 });
  }

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const tradeDiagnostics: CommunityMessengerRoomSnapshotDiagnostics = {};
  await runCommunityMessengerRoomTradeDiagnosticsParallelForE2e(auth.userId, canon.canonicalRoomId, tradeDiagnostics);

  return NextResponse.json({ ok: true, tradeDiagnostics });
}
