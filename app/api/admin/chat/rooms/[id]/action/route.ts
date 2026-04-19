/**
 * POST /api/admin/chat/rooms/:id/action — 관리자 채팅방 조치 (chat_rooms 전용, product_chats id면 연결 room 조회)
 * Body: { action, note? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveChatRoomId } from "@/lib/admin-chats/resolve-chat-room-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BodyAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off"
  | "warn";

function mapActionToModeration(action: BodyAction): "warn" | "restrict_chat" | "lock_room" | "mute_room" {
  switch (action) {
    case "block_room":
      return "restrict_chat";
    case "unblock_room":
    case "unarchive_room":
    case "readonly_off":
      return "warn";
    case "archive_room":
      return "lock_room";
    case "readonly_on":
      return "mute_room";
    case "warn":
    default:
      return "warn";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { id: paramId } = await params;
  if (!paramId?.trim()) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body 필요" }, { status: 400 });
  }
  const action = (body.action ?? "").trim() as BodyAction;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";

  const allowed: BodyAction[] = [
    "block_room",
    "unblock_room",
    "archive_room",
    "unarchive_room",
    "readonly_on",
    "readonly_off",
    "warn",
  ];
  if (!allowed.includes(action)) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 action" }, { status: 400 });
  }

  const sbAny = sb;
  const roomId = await resolveChatRoomId(sbAny, paramId.trim());
  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "chat_rooms 채팅을 찾을 수 없습니다. (마이그레이션·연결 room 확인)" },
      { status: 404 }
    );
  }

  const adminId = admin.userId;
  const now = new Date().toISOString();
   
  const db = sbAny as any;

  const insertModeration = async (reason?: string, modNote?: string) => {
    const modType = mapActionToModeration(action);
    await db.from("moderation_actions").insert({
      target_type: "room",
      target_id: roomId,
      action_type: modType,
      action_reason: reason ?? undefined,
      action_note: modNote ?? undefined,
      actor_admin_id: adminId,
    });
  };

  const insertEvent = async (eventType: string, metadata: Record<string, unknown> = {}) => {
    await db.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: eventType,
      actor_admin_id: adminId,
      metadata: { ...metadata, admin_action: action, note: note || undefined },
    });
  };

  try {
    switch (action) {
      case "block_room":
        await db
          .from("chat_rooms")
          .update({
            is_blocked: true,
            blocked_by: adminId,
            blocked_at: now,
            updated_at: now,
          })
          .eq("id", roomId);
        await insertEvent("room_blocked", { by: "admin" });
        await insertModeration("관리자 채팅방 차단", note || undefined);
        break;
      case "unblock_room":
        await db
          .from("chat_rooms")
          .update({
            is_blocked: false,
            blocked_by: null,
            blocked_at: null,
            updated_at: now,
          })
          .eq("id", roomId);
        await insertEvent("room_unblocked", { by: "admin" });
        await insertModeration(undefined, note ? `관리자 차단 해제 · ${note}` : "관리자 차단 해제");
        break;
      case "archive_room":
        await db
          .from("chat_rooms")
          .update({
            is_locked: true,
            locked_by: adminId,
            locked_at: now,
            updated_at: now,
          })
          .eq("id", roomId);
        await insertEvent("room_locked", { reason: "admin_archive", note });
        await insertModeration(note || undefined, "관리자 보관(잠금)");
        break;
      case "unarchive_room":
        await db
          .from("chat_rooms")
          .update({
            is_locked: false,
            locked_by: null,
            locked_at: null,
            updated_at: now,
          })
          .eq("id", roomId);
        await insertEvent("room_unlocked", { by: "admin", note });
        await insertModeration(undefined, note ? `관리자 보관 해제 · ${note}` : "관리자 보관 해제");
        break;
      case "readonly_on":
        await db.from("chat_rooms").update({ is_readonly: true, updated_at: now }).eq("id", roomId);
        await insertEvent("room_locked", { reason: "readonly_on", note });
        await insertModeration("읽기 전용", note || undefined);
        break;
      case "readonly_off":
        await db.from("chat_rooms").update({ is_readonly: false, updated_at: now }).eq("id", roomId);
        await insertEvent("room_unlocked", { reason: "readonly_off", note });
        await insertModeration(undefined, note ? `읽기 전용 해제 · ${note}` : "읽기 전용 해제");
        break;
      case "warn":
        await insertModeration(note || undefined, "관리자 경고");
        break;
      default:
        break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/is_readonly|column .* does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DB에 is_readonly 컬럼이 없을 수 있습니다. 일반채팅 확장 마이그레이션( related_* / is_readonly )을 적용해 주세요.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, effectiveRoomId: roomId });
}
