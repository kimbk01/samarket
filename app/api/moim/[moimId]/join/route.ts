import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimJoin, moimJoinCancel } from "@/lib/moim/server/moim-rpc.server";
import { readMoimJoinAnswers } from "@/lib/moim/moim-state-gate";
import { notifyMoimAfterResponse, notifyMoimJoinRequested, notifyMoimMemberJoined } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** P3 가입 (바로 가입 / 승인 신청). 링크로 들어왔으면 inviteToken */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join", limit: 10, phone: true });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ answers?: unknown; nickname?: unknown; avatarUrl?: unknown; bio?: unknown; inviteToken?: unknown }>(req)) ?? {};
  /** R5 B11: 1,000자를 넘는 답은 자르지 않고 거부 */
  const answers = readMoimJoinAnswers(body.answers);
  if (answers === "too_long") return NextResponse.json({ ok: false, error: "moim_join_answer_too_long" }, { status: 400 });
  const result = await moimJoin(
    g.userId,
    moimId,
    {
      answers: answers ?? [],
      profile: {
        nickname: typeof body.nickname === "string" ? body.nickname : undefined,
        avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
        bio: typeof body.bio === "string" ? body.bio : undefined,
      },
      inviteToken: typeof body.inviteToken === "string" ? body.inviteToken : null,
    },
    g.sb
  );
  const name = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (result.ok && result.status === "pending" && result.request_id) {
    const requestId = result.request_id;
    /** R2 N-08c: 이름 = DB 가 정한 닉네임(프로필 대체 포함) */
    const requestName = (result.nickname ?? name).trim();
    notifyMoimAfterResponse(() => notifyMoimJoinRequested(g.sb, moimId, requestId, requestName, g.userId));
  }
  /** 바로 가입 → 모임장에게 벨만 (설계 §7 moim_member_joined · 감사 B2) */
  if (result.ok && result.status === "active") {
    notifyMoimAfterResponse(() => notifyMoimMemberJoined(g.sb, moimId, g.userId, name));
  }
  return moimRpcResponse(result);
}

/** 가입 신청 취소 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "join_cancel", limit: 10, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimJoinCancel(g.userId, moimId, g.sb));
}
