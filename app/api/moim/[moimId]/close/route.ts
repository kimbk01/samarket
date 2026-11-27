import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimClose } from "@/lib/moim/server/moim-rpc.server";
import { listActiveMoimMemberIds, loadMoimName } from "@/lib/moim/server/moim-queries.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P15 모임 종료 (모임장, 이름 확인) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "close", limit: 5, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ confirmName?: unknown }>(req);
  if (typeof body?.confirmName !== "string") return moimBadRequest();
  /** 종료로 취소될 일정(모집 중·정원·마감)과 그 확정·신청자 — 일정 취소 알림용 (설계 P15·§7 · 감사 B13). 일정 직접 취소와 같은 받는 사람 */
  const [members, moim, openSchedules] = await Promise.all([
    listActiveMoimMemberIds(g.sb, moimId),
    loadMoimName(g.sb, moimId),
    g.sb.from("moim_schedules").select("id, title").eq("moim_id", moimId).in("status", ["recruiting", "full", "closed"]),
  ]);
  const schedules = (openSchedules.data ?? []) as { id: string; title: string }[];
  const participants = schedules.length
    ? (((
        await g.sb
          .from("moim_schedule_participants")
          .select("schedule_id, user_id")
          .in("schedule_id", schedules.map((s) => s.id))
          .in("status", ["confirmed", "requested"])
      ).data ?? []) as { schedule_id: string; user_id: string }[])
    : [];
  const result = await moimClose(g.userId, moimId, body.confirmName, g.sb);
  if (result.ok) {
    /** 발송은 응답 뒤(감사 E1) — 받는 사람은 종료 전에 읽어 둔 값 */
    notifyMoimAfterResponse(async () => {
      await notifyMoimMany(g.sb, members.filter((id) => id !== g.userId), {
        kind: "moim_closed",
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: moimId,
        vars: { moim },
      });
      for (const s of schedules) {
        const to = participants.filter((p) => p.schedule_id === s.id && p.user_id !== g.userId).map((p) => p.user_id);
        if (!to.length) continue;
        await notifyMoimMany(g.sb, to, {
          kind: "moim_schedule_cancelled",
          moimId,
          linkUrl: moimPaths.schedule(moimId, s.id),
          dedupeRef: s.id,
          vars: { title: s.title },
        });
      }
    });
  }
  return moimRpcResponse(result);
}
