import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { loadMoimAccess, type MoimAccess } from "@/lib/moim/server/moim-queries.server";
import type { MoimScheduleInput } from "@/lib/moim/server/moim-rpc.server";

/** 요청 본문 → 일정 입력 (있는 칸만). 시간은 ISO 문자열 */
export function readMoimScheduleInput(body: Record<string, unknown> | null): MoimScheduleInput | null {
  if (!body || typeof body !== "object") return null;
  const out: MoimScheduleInput = {};
  const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  if (typeof body.title === "string") out.title = body.title;
  if (body.startsAt !== undefined) {
    const v = iso(body.startsAt);
    if (!v) return null;
    out.startsAt = v;
  }
  if (body.endsAt !== undefined) out.endsAt = body.endsAt === null ? null : iso(body.endsAt);
  if (typeof body.placeText === "string") out.placeText = body.placeText;
  if (typeof body.placeLat === "number" || body.placeLat === null) out.placeLat = body.placeLat as number | null;
  if (typeof body.placeLng === "number" || body.placeLng === null) out.placeLng = body.placeLng as number | null;
  if (typeof body.description === "string") out.description = body.description;
  if (Array.isArray(body.images)) out.images = body.images.filter((u): u is string => typeof u === "string").slice(0, 10);
  if (typeof body.capacity === "number" || body.capacity === null) out.capacity = body.capacity as number | null;
  if (body.joinMode === "first_come" || body.joinMode === "approval") out.joinMode = body.joinMode;
  if (typeof body.askMotivation === "boolean") out.askMotivation = body.askMotivation;
  return out;
}

/** 일정 id → 그 모임의 보기 권한 */
export async function loadScheduleAccess(sb: SupabaseServer, scheduleId: string, viewerId: string | null): Promise<MoimAccess | null> {
  const { data } = await sb.from("moim_schedules").select("moim_id").eq("id", scheduleId).maybeSingle();
  const moimId = (data as { moim_id?: string } | null)?.moim_id;
  return moimId ? loadMoimAccess(sb, moimId, viewerId) : null;
}
