import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { loadMoimAccess } from "@/lib/moim/server/moim-queries.server";
import { getMoimNotificationPrefs } from "@/lib/moim/server/moim-schedule-queries.server";
import { moimNotificationPrefsSet } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 이 모임 알림 설정 (멤버 본인) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "notification_prefs" });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access?.role) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  const userId = g.userId!;
  const roomId = access.moim.main_room_id;
  /**
   * R5 B21: 모임 채팅방 알림 상태 = 메신저 음소거(`community_messenger_participants.is_muted`, 대표 방·나) — 읽기만, 여기서 바꾸지 않는다.
   * 읽지 못하면 null(화면은 상태를 비운다).
   */
  const [prefs, muted] = await Promise.all([
    getMoimNotificationPrefs(g.sb, moimId, userId),
    roomId
      ? g.sb.from("community_messenger_participants").select("is_muted").eq("room_id", roomId).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const row = muted.data as { is_muted?: boolean } | null;
  const chatMuted = muted.error || !row ? null : row.is_muted === true;
  return NextResponse.json({ ok: true, prefs: { ...prefs, chatMuted } });
}

/** body { notice?, posts?, schedules? } — 끌 수 없는 결과 알림(승인·거절·내보내기·취소 등)은 여기서 바뀌지 않는다 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "notification_prefs_set", limit: 30, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<Record<string, unknown>>(req)) ?? {};
  const prefs: Partial<{ notice: boolean; posts: boolean; schedules: boolean }> = {};
  for (const k of ["notice", "posts", "schedules"] as const) if (typeof body[k] === "boolean") prefs[k] = body[k] as boolean;
  return moimRpcResponse(await moimNotificationPrefsSet(g.userId, moimId, prefs, g.sb));
}
