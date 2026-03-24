/**
 * POST /api/admin/chat/rooms/bulk-delete
 * 관리자: 채팅방 영구 삭제 (통합 chat_rooms 또는 레거시 product_chats)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

const MAX_BATCH = 50;

type Storage = "chat_rooms" | "product_chats";

function parseBody(body: unknown): { id: string; storage: Storage }[] | null {
  if (!body || typeof body !== "object") return null;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: { id: string; storage: Storage }[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id.trim() : "";
    const storage = (row as { storage?: unknown }).storage;
    if (!id || (storage !== "chat_rooms" && storage !== "product_chats")) continue;
    out.push({ id, storage });
  }
  return out.length ? out : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY 등 서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const parsed = parseBody(json);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "items: { id, storage: chat_rooms|product_chats }[] 형식이 필요합니다." },
      { status: 400 }
    );
  }
  if (parsed.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `한 번에 최대 ${MAX_BATCH}개까지 삭제할 수 있습니다.` },
      { status: 400 }
    );
  }

  const chatRoomIds = parsed.filter((x) => x.storage === "chat_rooms").map((x) => x.id);
  const productChatIds = parsed.filter((x) => x.storage === "product_chats").map((x) => x.id);

  const deleted: string[] = [];
  const errors: { id: string; message: string }[] = [];

  if (chatRoomIds.length > 0) {
    await sb.from("moderation_actions").delete().eq("target_type", "room").in("target_id", chatRoomIds);
    const { error: delErr } = await sb.from("chat_rooms").delete().in("id", chatRoomIds);
    if (delErr) {
      for (const id of chatRoomIds) errors.push({ id, message: delErr.message });
    } else {
      deleted.push(...chatRoomIds);
    }
  }

  if (productChatIds.length > 0) {
    await sb.from("reports").delete().eq("target_type", "chat_room").in("target_id", productChatIds);
    await sb.from("reports").delete().in("room_id", productChatIds);

    const { error: pcErr } = await sb.from("product_chats").delete().in("id", productChatIds);
    if (pcErr) {
      for (const id of productChatIds) {
        if (!errors.some((e) => e.id === id)) errors.push({ id, message: pcErr.message });
      }
    } else {
      for (const id of productChatIds) {
        if (!deleted.includes(id)) deleted.push(id);
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    errors: errors.length ? errors : undefined,
  });
}
