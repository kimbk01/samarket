import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead } from "@/lib/moim/server/moim-route-guard.server";
import { isUuidString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MoimRoomOwnerDto = { moimId: string; kind: "moim" | "schedule"; moimName: string };

/**
 * 메신저 방 → 소유 모임 (보는 사람이 참여 중인 방만). 채팅 목록 「모임」 배지 · 방 「모임 홈」 버튼 · 관리 메뉴 숨김용.
 * 부트스트랩(채팅 목록 핫 경로)은 건드리지 않고 별도로 묻는다.
 */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "room_owners", limit: 120, requireLogin: true });
  if (!g.ok) return g.response;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isUuidString(s))
    .slice(0, 100);
  if (!ids.length) return NextResponse.json({ ok: true, owners: {} });
  const { data: mine } = await g.sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", g.userId!)
    .in("room_id", ids);
  const myRoomIds = ((mine ?? []) as { room_id: string }[]).map((r) => r.room_id);
  if (!myRoomIds.length) return NextResponse.json({ ok: true, owners: {} });
  const { data: rooms } = await g.sb
    .from("community_messenger_rooms")
    .select("id, owner_ref_id")
    .eq("owner_domain", "moim")
    .in("id", myRoomIds);
  const roomRows = (rooms ?? []) as { id: string; owner_ref_id: string }[];
  if (!roomRows.length) return NextResponse.json({ ok: true, owners: {} });
  const refIds = roomRows.map((r) => r.owner_ref_id);
  const [{ data: moims }, { data: schedules }] = await Promise.all([
    g.sb.from("moims").select("id, name").in("id", refIds),
    g.sb.from("moim_schedules").select("id, moim_id").in("id", refIds),
  ]);
  const moimName = new Map(((moims ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
  const scheduleMoim = new Map(((schedules ?? []) as { id: string; moim_id: string }[]).map((s) => [s.id, s.moim_id]));
  const missing = [...new Set([...scheduleMoim.values()].filter((id) => !moimName.has(id)))];
  if (missing.length) {
    const { data: more } = await g.sb.from("moims").select("id, name").in("id", missing);
    for (const m of (more ?? []) as { id: string; name: string }[]) moimName.set(m.id, m.name);
  }
  const owners: Record<string, MoimRoomOwnerDto> = {};
  for (const r of roomRows) {
    const scheduleOf = scheduleMoim.get(r.owner_ref_id);
    const moimId = scheduleOf ?? r.owner_ref_id;
    owners[r.id] = { moimId, kind: scheduleOf ? "schedule" : "moim", moimName: moimName.get(moimId) ?? "" };
  }
  return NextResponse.json({ ok: true, owners });
}
