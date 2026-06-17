/**
 * GET /api/admin/chat/block-history — 차단 이력 (관리자)
 * Query: blockerId, blockedUserId, roomId, limit
 *
 * SSOT: user_social_relations (relation_type = blocked) 우선.
 * Legacy: user_blocks — 해제 이력(released_at)·source_room_id 감사용 fallback.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlockHistoryItem = {
  id: string;
  blockerId: string;
  blockedUserId: string;
  createdAt: string;
  releasedAt: string | null;
  sourceRoomId: string | null;
  reason: string | null;
  source: "ssot" | "legacy";
};

function pairKey(blockerId: string, blockedUserId: string): string {
  return `${blockerId}:${blockedUserId}`;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb;

  const blockerId = req.nextUrl.searchParams.get("blockerId")?.trim() ?? "";
  const blockedUserId = req.nextUrl.searchParams.get("blockedUserId")?.trim() ?? "";
  const roomId = req.nextUrl.searchParams.get("roomId")?.trim() ?? "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);

  let ssotQ = sbAny
    .from("user_social_relations")
    .select("id, owner_user_id, target_user_id, created_at, updated_at")
    .eq("relation_type", "blocked")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (blockerId) ssotQ = ssotQ.eq("owner_user_id", blockerId);
  if (blockedUserId) ssotQ = ssotQ.eq("target_user_id", blockedUserId);
  if (roomId) {
    /** SSOT 에 source_room_id 없음 — roomId 필터는 legacy 전용 */
    ssotQ = ssotQ.limit(0);
  }

  let legacyQ = sbAny
    .from("user_blocks")
    .select("id, user_id, blocked_user_id, source_room_id, reason, created_at, released_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (blockerId) legacyQ = legacyQ.eq("user_id", blockerId);
  if (blockedUserId) legacyQ = legacyQ.eq("blocked_user_id", blockedUserId);
  if (roomId) legacyQ = legacyQ.eq("source_room_id", roomId);

  const [{ data: ssotRows, error: ssotErr }, { data: legacyRows, error: legacyErr }] = await Promise.all([
    ssotQ,
    legacyQ,
  ]);

  if (ssotErr && legacyErr) {
    return NextResponse.json({ error: ssotErr.message ?? legacyErr.message }, { status: 500 });
  }

  const ssotItems: BlockHistoryItem[] = (ssotRows ?? []).map((row) => {
    const r = row as {
      id?: string;
      owner_user_id?: string;
      target_user_id?: string;
      created_at?: string;
    };
    return {
      id: String(r.id ?? ""),
      blockerId: String(r.owner_user_id ?? ""),
      blockedUserId: String(r.target_user_id ?? ""),
      createdAt: String(r.created_at ?? ""),
      releasedAt: null,
      sourceRoomId: null,
      reason: null,
      source: "ssot" as const,
    };
  });

  const ssotActivePairs = new Set(
    ssotItems.map((item) => pairKey(item.blockerId, item.blockedUserId))
  );

  const legacyItems: BlockHistoryItem[] = (legacyRows ?? [])
    .map((row) => {
      const r = row as {
        id?: string;
        user_id?: string;
        blocked_user_id?: string;
        source_room_id?: string | null;
        reason?: string | null;
        created_at?: string;
        released_at?: string | null;
      };
      const blocker = String(r.user_id ?? "");
      const blocked = String(r.blocked_user_id ?? "");
      const releasedAt = r.released_at ? String(r.released_at) : null;
      return {
        id: String(r.id ?? ""),
        blockerId: blocker,
        blockedUserId: blocked,
        createdAt: String(r.created_at ?? ""),
        releasedAt,
        sourceRoomId: r.source_room_id ? String(r.source_room_id) : null,
        reason: r.reason ? String(r.reason) : null,
        source: "legacy" as const,
      };
    })
    .filter((item) => {
      if (!item.blockerId || !item.blockedUserId) return false;
      /** 활성 legacy 중 SSOT 에 이미 있으면 legacy 중복 제외 */
      if (!item.releasedAt && ssotActivePairs.has(pairKey(item.blockerId, item.blockedUserId))) {
        return false;
      }
      return true;
    });

  const blocks = [...ssotItems, ...legacyItems]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return NextResponse.json({
    blocks,
    meta: {
      primarySource: "user_social_relations",
      ssotCount: ssotItems.length,
      legacyCount: legacyItems.length,
      total: blocks.length,
      roomIdFilterLegacyOnly: Boolean(roomId),
    },
  });
}
