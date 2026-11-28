/**
 * POST /api/admin/moim/sanctions/[sanctionId] — 제재 해제 (설계 moim §6 P14). 권한 키 `moim`. body { reason }
 * 알림 `moim_sanction_released`(R2 N-04): 차단 해제 = 전체 멤버 · 그 밖 = 모임장. 발송은 응답 뒤
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminSanctionRevoke } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

const STATE_RANK: Record<string, number> = { normal: 0, unlisted: 1, warned: 2, blocked: 3 };
const LEVEL_RANK = { unlist: 1, warn: 2, block: 3 } as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ sanctionId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const sanctionId = moimAdminUuid((await params).sanctionId);
  if (!sanctionId) return moimAdminBad("moim_sanction_not_found", 404);
  const body = await moimAdminJson<{ reason?: unknown }>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const r = await moimAdminSanctionRevoke(gate.actor.userId, sanctionId, reason, gate.sb);
  /** 같은 단계 이상의 다른 제재가 아직 걸려 있으면(상태 그대로) 「풀렸어요」를 보내지 않는다 (재감사 F4) */
  if (r.ok && (r.level === "unlist" || r.level === "warn" || r.level === "block") && STATE_RANK[r.platform_state] < LEVEL_RANK[r.level]) {
    const level = r.level;
    const moimId = r.moim_id;
    const to = r.notify_user_ids ?? [];
    notifyMoimAfterResponse(() =>
      notifyMoimMany(gate.sb, to, {
        kind: "moim_sanction_released",
        variant: level,
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: sanctionId,
        vars: { moim: r.name ?? "" },
      })
    );
  }
  return moimAdminRpcResponse(r);
}
