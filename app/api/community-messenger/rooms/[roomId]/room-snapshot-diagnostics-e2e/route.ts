import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { runCommunityMessengerRoomTradeDiagnosticsParallelForE2e } from "@/lib/community-messenger/service";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT = 20;

/**
 * E2E·성능 추적: RSC 인라인 진단 제거 후에도 `#samarket-room-snapshot-diag` 와 동일 구조의 JSON 을
 * 한 번의 서버 왕복으로 채운다(부트스트랩 스냅샷 본문은 응답에 포함하지 않음).
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
  const traceSnapshot = process.env.MESSENGER_PERF_TRACE_ROOM_SNAPSHOT === "1";
  if (!e2eRoomTrace && !traceSnapshot) {
    return NextResponse.json({ ok: false, error: "room_snapshot_diag_gate" }, { status: 403 });
  }

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const readPort = createSupabaseCommunityMessengerReadPort();
  const diagnostics: CommunityMessengerRoomSnapshotDiagnostics = {};
  await loadCommunityMessengerRoomBootstrap(readPort, auth.userId, canon.canonicalRoomId, {
    initialMessageLimit: Math.min(
      COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT,
      COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT
    ),
    hydrateFullMemberList: false,
    deferSnapshotSecondary: true,
    diagnostics,
    e2eRoomSnapshotDiag: e2eRoomTrace,
  });
  await runCommunityMessengerRoomTradeDiagnosticsParallelForE2e(auth.userId, canon.canonicalRoomId, diagnostics);

  return NextResponse.json({ ok: true, diagnostics });
}
