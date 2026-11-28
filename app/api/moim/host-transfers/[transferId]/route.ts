import type { NextRequest } from "next/server";
import { guardMoimAcceptGate, guardMoimWrite, moimBadRequest, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimHostTransferCancel, moimHostTransferRespond } from "@/lib/moim/server/moim-rpc.server";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { listActiveMoimMemberIds } from "@/lib/moim/server/moim-queries.server";
import { notifyMoimAfterResponse, notifyMoimHostChanged } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ transferId: string }> };

/** P8 위임 수락·거절 — body { accept, nickname? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const transferId = requireUuid((await params).transferId);
  if (!transferId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "host_transfer_respond", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ accept?: unknown }>(req);
  if (typeof body?.accept !== "boolean") return moimBadRequest();
  /** 결정 1 (Owner 2026-11-27): 수락 = 모임장 권한을 새로 받음 → 가입 필요. 거절은 가입 없이 (규칙 표 split) */
  if (body.accept === true) {
    const registrationGate = await requireRegistrationForAction(g.userId);
    if (registrationGate) return registrationGate;
    /** R1 A-09: 모임장이 되는 수락은 가입 버튼과 같은 이용 제한·휴대폰 확인 */
    const acceptGate = await guardMoimAcceptGate(g.userId);
    if (acceptGate) return acceptGate;
  }
  const result = await moimHostTransferRespond(g.userId, transferId, body.accept, g.sb);
  if (result.ok && result.accepted && result.moim_id) {
    const moimId = result.moim_id;
    /** 전체 멤버 발송은 응답 뒤(감사 E1). R5 E16: 모임장 변경 알림은 공용 함수 하나 — 수락한 사람(새 모임장)은 받지 않는다 */
    notifyMoimAfterResponse(async () => {
      const members = await listActiveMoimMemberIds(g.sb, moimId);
      await notifyMoimHostChanged(g.sb, moimId, g.userId, members, transferId, { actorId: g.userId });
    });
  }
  return moimRpcResponse(result);
}

/**
 * R5 C5: 내가(모임장) 보낸 직접 위임 요청 취소. 미접속 변경 요청·남의 요청·이미 처리된 요청 → moim_transfer_not_found(404).
 * 물러나는 동작이라 약관 동의 전에도 된다(동의 예외 표에 등록). 받는 사람 배너는 다음 상세 불러오기에서 사라진다(알림 없음 — 계약 §7).
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const transferId = requireUuid((await params).transferId);
  if (!transferId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "host_transfer_cancel", limit: 10, writeKind: "none", consentExempt: true });
  if (!g.ok) return g.response;
  return moimRpcResponse(await moimHostTransferCancel(g.userId, transferId, g.sb));
}
