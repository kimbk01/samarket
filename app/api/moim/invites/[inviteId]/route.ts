import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimAcceptGate, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteRespond } from "@/lib/moim/server/moim-rpc.server";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { readMoimJoinAnswers } from "@/lib/moim/moim-state-gate";
import { notifyMoimAfterResponse, notifyMoimJoinRequested, notifyMoimMemberJoined } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ inviteId: string }> };

/**
 * 초대 수락·거절 — body { accept, nickname?, avatarUrl?, bio?, answers? } (answers: R3 U-13 가입 질문 답 · 수락만)
 * R5 B5: 거절은 휴대폰·약관 없이 된다. 수락만 약관 → 가입 → 이용 제한·휴대폰을 차례로 확인한다(위임 수락 라우트와 같은 순서).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const inviteId = requireUuid((await params).inviteId);
  if (!inviteId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_respond", limit: 20, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ accept?: unknown; nickname?: unknown; avatarUrl?: unknown; bio?: unknown; answers?: unknown }>(req);
  if (typeof body?.accept !== "boolean") return moimBadRequest();
  const answers = body.accept === true ? readMoimJoinAnswers(body.answers) : undefined;
  /** R5 B11: 답이 1,000자를 넘으면 자르지 않고 거부 */
  if (answers === "too_long") return NextResponse.json({ ok: false, error: "moim_join_answer_too_long" }, { status: 400 });
  /** 섞인 경로(설계 2026-11-21 §4 C) — 새 행동 분기만 약관·가입(전화 + 대표 주소) 확인, 거절은 가입 없이 */
  if (body.accept === true) {
    const terms = await requireSignupCompleteForUser(g.sb, g.userId);
    if (!terms.ok) return terms.response;
    const registrationGate = await requireRegistrationForAction(g.userId);
    if (registrationGate) return registrationGate;
    /** R1 A-09: 가입이 되는 수락은 가입 버튼과 같은 이용 제한·휴대폰 확인 */
    const acceptGate = await guardMoimAcceptGate(g.userId);
    if (acceptGate) return acceptGate;
  }
  const result = await moimInviteRespond(
    g.userId,
    inviteId,
    body.accept,
    {
      nickname: typeof body.nickname === "string" ? body.nickname : undefined,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
      bio: typeof body.bio === "string" ? body.bio : undefined,
      ...(answers !== undefined ? { answers } : {}),
    },
    g.sb
  );
  /** 수락 뒤 알림 (설계 §7): 승인제·멤버 초대 → 가입 신청을 승인권자에게(감사 B3) · 바로 가입·운영진 초대 → 새 멤버를 모임장에게(B2) */
  if (result.ok && body.accept === true && typeof result.moim_id === "string") {
    const moimId = result.moim_id;
    const name = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (result.status === "pending" && typeof result.request_id === "string") {
      const requestId = result.request_id;
      const requestName = (typeof result.nickname === "string" ? result.nickname : name).trim();
      notifyMoimAfterResponse(() => notifyMoimJoinRequested(g.sb, moimId, requestId, requestName, g.userId));
    } else if (result.status === "active") {
      notifyMoimAfterResponse(() => notifyMoimMemberJoined(g.sb, moimId, g.userId, name));
    }
  }
  return moimRpcResponse(result);
}
