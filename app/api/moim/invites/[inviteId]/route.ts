import type { NextRequest } from "next/server";
import { guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimInviteRespond } from "@/lib/moim/server/moim-rpc.server";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ inviteId: string }> };

/** 초대 수락·거절 — body { accept, nickname?, avatarUrl?, bio? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const inviteId = requireUuid((await params).inviteId);
  if (!inviteId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_respond", limit: 20, writeKind: "none", phone: true });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ accept?: unknown; nickname?: unknown; avatarUrl?: unknown; bio?: unknown }>(req);
  if (typeof body?.accept !== "boolean") return moimBadRequest();
  /** 섞인 경로(설계 2026-11-21 §4 C) — 새 행동 분기만 가입(전화 + 대표 주소) 확인, 거절·해제는 가입 없이 */
  if (body.accept === true) {
    const registrationGate = await requireRegistrationForAction(g.userId);
    if (registrationGate) return registrationGate;
  }
  return moimRpcResponse(
    await moimInviteRespond(
      g.userId,
      inviteId,
      body.accept,
      {
        nickname: typeof body.nickname === "string" ? body.nickname : undefined,
        avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
        bio: typeof body.bio === "string" ? body.bio : undefined,
      },
      g.sb
    )
  );
}
