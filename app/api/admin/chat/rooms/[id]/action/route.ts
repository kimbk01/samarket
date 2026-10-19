/**
 * POST /api/admin/chat/rooms/:id/action — 관리자 채팅방 조치 (chat_rooms 전용, product_chats id면 연결 room 조회)
 * Body: { action, reason } (`note` 호환 별칭) — R1-A: 권한 `chats` + 사유 2자 이상 + 상태 조건(409) + audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, chatAdminStaleState, requireTradeChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveChatRoomId } from "@/lib/admin-chats/resolve-chat-room-id";
import { resolveTradeMessengerRoomForAdmin } from "@/lib/admin-chats/trade-messenger-room";
import { runCmRoomActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";

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
  const admin = await requireTradeChatAdmin();
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

  let body: { action?: string; note?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body 필요" }, { status: 400 });
  }
  const action = (body.action ?? "").trim() as BodyAction;
  const note = normalizeChatAdminReason(body.reason ?? body.note);

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
  if (!isChatAdminReasonValid(note, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  const sbAny = sb;

  /**
   * R1-B C-1: 조치는 사용자 앱이 쓰는 CM 방에 먼저 적용 (메신저 Admin 과 같은 CAS·감사 경로).
   * 레거시 `chat_rooms` 플래그는 이후 동기만 한다 (드리프트로 인한 레거시 409 는 무시).
   * CM 방이 없는 레거시 전용 기록은 읽기 전용 — 경고 기록 외 조치 불가.
   */
  const messenger = await resolveTradeMessengerRoomForAdmin(sbAny, paramId.trim()).catch(() => null);
  const messengerRoomId = messenger?.messengerRoomId ?? null;
  let messengerApplied = false;
  if (action !== "warn") {
    if (!messengerRoomId) {
      return NextResponse.json({ ok: false, error: "legacy_only_read_only" }, { status: 409 });
    }
    const cm = await runCmRoomActionCas(admin.sb, req, {
      roomId: messengerRoomId,
      adminUserId: admin.actor.userId,
      action,
      reason: note,
      source: `admin_trade_chat:${paramId.trim()}`,
    });
    if (!cm.ok) {
      return NextResponse.json({ ok: false, error: cm.error, messengerRoomId }, { status: cm.status });
    }
    messengerApplied = true;
  }

  const roomId = await resolveChatRoomId(sbAny, paramId.trim());
  if (!roomId && messengerApplied) {
    return NextResponse.json({ ok: true, effectiveRoomId: null, messengerRoomId });
  }
  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "chat_rooms 채팅을 찾을 수 없습니다. (마이그레이션·연결 room 확인)" },
      { status: 404 }
    );
  }

  const adminId = admin.actor.userId;
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

  /** R1-A C-5: 상태 조건 갱신 — 기대 상태가 아니면 0행 → 409 (중복 클릭·동시 처리). */
  const CAS: Partial<Record<BodyAction, { column: "is_blocked" | "is_locked" | "is_readonly"; expect: boolean; patch: Record<string, unknown> }>> = {
    block_room: { column: "is_blocked", expect: false, patch: { is_blocked: true, blocked_by: adminId, blocked_at: now } },
    unblock_room: { column: "is_blocked", expect: true, patch: { is_blocked: false, blocked_by: null, blocked_at: null } },
    archive_room: { column: "is_locked", expect: false, patch: { is_locked: true, locked_by: adminId, locked_at: now } },
    unarchive_room: { column: "is_locked", expect: true, patch: { is_locked: false, locked_by: null, locked_at: null } },
    readonly_on: { column: "is_readonly", expect: false, patch: { is_readonly: true } },
    readonly_off: { column: "is_readonly", expect: true, patch: { is_readonly: false } },
  };

  let beforeFlags: Record<string, unknown> | null = null;
  try {
    const { data: beforeRow } = await db
      .from("chat_rooms")
      .select("is_blocked, is_locked, is_readonly")
      .eq("id", roomId)
      .maybeSingle();
    beforeFlags = (beforeRow as Record<string, unknown> | null) ?? null;

    const cas = CAS[action];
    if (cas) {
      let q = db.from("chat_rooms").update({ ...cas.patch, updated_at: now }).eq("id", roomId);
      // is_readonly 는 NULL 이 false 와 같은 의미 — 켜기 CAS 는 NULL 도 허용.
      q = cas.expect === false ? q.or(`${cas.column}.is.null,${cas.column}.eq.false`) : q.eq(cas.column, true);
      const { data: updated, error: updErr } = await q.select("id");
      if (updErr) throw new Error(updErr.message);
      if ((!updated || updated.length === 0) && !messengerApplied) return chatAdminStaleState(cas.column);
    }

    switch (action) {
      case "block_room":
        await insertEvent("room_blocked", { by: "admin" });
        await insertModeration("관리자 채팅방 차단", note);
        break;
      case "unblock_room":
        await insertEvent("room_unblocked", { by: "admin" });
        await insertModeration(undefined, `관리자 차단 해제 · ${note}`);
        break;
      case "archive_room":
        await insertEvent("room_locked", { reason: "admin_archive", note });
        await insertModeration(note, "관리자 보관(잠금)");
        break;
      case "unarchive_room":
        await insertEvent("room_unlocked", { by: "admin", note });
        await insertModeration(undefined, `관리자 보관 해제 · ${note}`);
        break;
      case "readonly_on":
        await insertEvent("room_locked", { reason: "readonly_on", note });
        await insertModeration("읽기 전용", note);
        break;
      case "readonly_off":
        await insertEvent("room_unlocked", { reason: "readonly_off", note });
        await insertModeration(undefined, `읽기 전용 해제 · ${note}`);
        break;
      case "warn":
        await insertModeration(note, "관리자 경고");
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

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: adminId,
    targetType: "chat_room",
    targetId: roomId,
    action: `chat_room.${action}`,
    before: beforeFlags,
    after: { action, reason: note, ...(CAS[action]?.patch ?? {}), requestedId: paramId.trim() },
  });

  return NextResponse.json({ ok: true, effectiveRoomId: roomId, messengerRoomId });
}
