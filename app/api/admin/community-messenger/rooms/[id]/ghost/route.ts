import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  countRoomParticipantsForGhostProbe,
  enterGhostRoom,
  exitGhostRoom,
} from "@/lib/community-messenger/group/group-room-ghost-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Ghost enter/exit (Platform Admin only).
 * Body: { action: "enter" | "exit", reason?: string }
 * Never creates participants.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id: rawId } = await params;
  const roomId = String(rawId ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "room_id_required" }, { status: 400 });
  }

  {
    const { resolveGroupRoomSupabase } = await import(
      "@/lib/community-messenger/group/group-room-repository"
    );
    const { isPrivateGroupRoomDeleted } = await import(
      "@/lib/community-messenger/group/group-room-delete-service"
    );
    const sb = resolveGroupRoomSupabase();
    if (sb && (await isPrivateGroupRoomDeleted(sb, roomId))) {
      return NextResponse.json({ ok: false, error: "group_deleted" }, { status: 410 });
    }
  }

  let body: { action?: string; reason?: string | null } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "enter" && action !== "exit") {
    return NextResponse.json({ ok: false, error: "action_required" }, { status: 400 });
  }

  const before = await countRoomParticipantsForGhostProbe(roomId);
  const result =
    action === "enter"
      ? await enterGhostRoom({
          adminUserId: admin.userId,
          roomId,
          reason: body.reason ?? null,
        })
      : await exitGhostRoom({
          adminUserId: admin.userId,
          roomId,
          reason: body.reason ?? null,
        });
  const after = await countRoomParticipantsForGhostProbe(roomId);

  if (!result.ok) {
    const status = result.error === "room_not_found" ? 404 : result.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    action: result.action,
    roomId: result.roomId,
    at: result.at,
    mode: "invisible_read_only",
    participantProbe: {
      before,
      after,
      unchanged: before.total === after.total && before.active === after.active,
    },
  });
}
