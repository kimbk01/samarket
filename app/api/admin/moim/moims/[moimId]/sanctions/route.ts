/**
 * POST /api/admin/moim/moims/[moimId]/sanctions — 모임 제재 적용 (설계 moim §6 P14 · §8). 권한 키 `moim`.
 * body { level: "unlist"|"warn"|"block", reasonCode(신고 사유 코드), reason, endsAt?: ISO }
 * 알림 `moim_sanctioned`(필수 — 끌 수 없음): 추천 제외·경고 = 모임장 · 차단 = 전체 멤버. 신고 연결은 M6.
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_SANCTION_LEVELS, type MoimAdminSanctionLevel } from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { isMoimReportReasonCode } from "@/lib/moim/moim-report-reasons";
import { moimAdminSanctionApply } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<{ level?: unknown; reasonCode?: unknown; reason?: unknown; endsAt?: unknown }>(req);
  const level = (MOIM_ADMIN_SANCTION_LEVELS as readonly unknown[]).includes(body?.level) ? (body?.level as MoimAdminSanctionLevel) : null;
  if (!level) return moimAdminBad("moim_sanction_level_invalid");
  if (!isMoimReportReasonCode(body?.reasonCode)) return moimAdminBad("moim_report_reason_invalid");
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  let endsAt: string | null = null;
  if (typeof body?.endsAt === "string" && body.endsAt.trim()) {
    const ms = Date.parse(body.endsAt);
    if (!Number.isFinite(ms)) return moimAdminBad("moim_sanction_period_invalid");
    endsAt = new Date(ms).toISOString();
  }
  const r = await moimAdminSanctionApply(gate.actor.userId, moimId, { level, reasonCode: body?.reasonCode as string, reason, endsAt }, gate.sb);
  if (r.ok) {
    await notifyMoimMany(gate.sb, r.notify_user_ids ?? [], {
      kind: "moim_sanctioned",
      variant: level,
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: r.sanction_id,
      vars: { moim: r.name ?? "" },
    });
  }
  return moimAdminRpcResponse(r);
}
