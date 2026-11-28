/**
 * POST /api/admin/moim/moims/[moimId]/sanctions — 모임 제재 적용 (설계 moim §6 P14 · §8). 권한 키 `moim`.
 * body { level: "unlist"|"warn"|"block", reasonCode(신고 사유 코드), reason, endsAt?: ISO, reportId?: 같은 모임 신고 id(선택 · R1 A-16) }
 * 끝나는 날은 추천 제외(unlist)만 (R4 D-14 — 경고·차단 + endsAt = 400 moim_sanction_period_not_allowed).
 * 사유 코드는 형식만 본다 — 운영 정책의 켜진 신고 사유인지는 RPC 가 본다(R4 §3 · 아니면 moim_report_reason_invalid).
 * 알림 `moim_sanctioned`(필수 — 끌 수 없음): 추천 제외·경고 = 모임장 · 차단 = 전체 멤버. 신고 연결은 M6.
 */
import type { NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_SANCTION_LEVELS, moimAdminLevelAllowsPeriod, type MoimAdminSanctionLevel } from "@/lib/admin/moim/moim-admin-contract";
import { moimAdminBad, moimAdminJson, moimAdminReason, moimAdminRpcResponse, moimAdminUuid } from "@/lib/admin/moim/moim-admin-route.server";
import { isMoimPolicyCode } from "@/lib/moim/moim-report-reasons";
import { moimAdminSanctionApply } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimAfterResponse, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<{ level?: unknown; reasonCode?: unknown; reason?: unknown; endsAt?: unknown; reportId?: unknown }>(req);
  const level = (MOIM_ADMIN_SANCTION_LEVELS as readonly unknown[]).includes(body?.level) ? (body?.level as MoimAdminSanctionLevel) : null;
  if (!level) return moimAdminBad("moim_sanction_level_invalid");
  if (!isMoimPolicyCode(body?.reasonCode)) return moimAdminBad("moim_report_reason_invalid");
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  let endsAt: string | null = null;
  if (typeof body?.endsAt === "string" && body.endsAt.trim()) {
    if (!moimAdminLevelAllowsPeriod(level)) return moimAdminBad("moim_sanction_period_not_allowed");
    const ms = Date.parse(body.endsAt);
    if (!Number.isFinite(ms)) return moimAdminBad("moim_sanction_period_invalid");
    endsAt = new Date(ms).toISOString();
  }
  let reportId: string | null = null;
  if (body?.reportId != null && body.reportId !== "") {
    reportId = moimAdminUuid(body.reportId);
    if (!reportId) return moimAdminBad("moim_report_not_found", 404);
  }
  const r = await moimAdminSanctionApply(gate.actor.userId, moimId, { level, reasonCode: body?.reasonCode as string, reason, endsAt, reportId }, gate.sb);
  if (r.ok) {
    const to = r.notify_user_ids ?? [];
    const sanctionId = r.sanction_id;
    const name = r.name ?? "";
    notifyMoimAfterResponse(() =>
      notifyMoimMany(gate.sb, to, {
        kind: "moim_sanctioned",
        variant: level,
        moimId,
        linkUrl: moimPaths.home(moimId),
        dedupeRef: sanctionId,
        vars: { moim: name },
      })
    );
  }
  return moimAdminRpcResponse(r);
}
