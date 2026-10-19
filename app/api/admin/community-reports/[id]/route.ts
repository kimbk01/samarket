import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  isCommunityReportStatus,
  resolveCommunityReportPatchTransition,
} from "@/lib/admin/community-admin/community-report-transitions";
import { getCommunityReportByIdForAdmin } from "@/lib/community-feed/admin-community-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 피드 신고 1건 (통합 상세 화면용) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const rid = id?.trim();
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  try {
    const row = await getCommunityReportByIdForAdmin(rid);
    if (!row) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

/**
 * 관리자: 피드 신고 검토 시작·메모·재오픈 (설계 §E-5).
 * - 신고 인정/기각은 `POST ./decision` 만 (조치·알림·포인트 회수를 한 요청에서 처리).
 * - 메모는 adminMemo(또는 레거시 admin_memo) 키가 있을 때만 바꾼다 (C-10: 상태 변경이 메모를 지우지 않음).
 * - 재오픈(resolved|dismissed→open)은 최고 관리자 + 사유 필수.
 * body: { status?, expectedStatus?, adminMemo?, reason? }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const rid = id?.trim();
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const statusRaw = body.status == null ? "" : String(body.status).trim();
  if (statusRaw && !isCommunityReportStatus(statusRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const memoKey = "adminMemo" in body ? "adminMemo" : "admin_memo" in body ? "admin_memo" : null;
  const memoProvided = memoKey !== null;
  const memoRaw = memoKey ? body[memoKey] : null;
  const memo = memoRaw != null && String(memoRaw).trim() ? String(memoRaw).trim().slice(0, 2000) : null;
  if (!statusRaw && !memoProvided) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const sb = admin.sb;
  const { data: before, error: beforeErr } = await sb
    .from("community_reports")
    .select("status, target_type, target_id, admin_memo")
    .eq("id", rid)
    .maybeSingle();
  if (beforeErr) {
    return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const prev = before as { status?: string; target_type?: string | null; target_id?: string | null; admin_memo?: string | null };
  const prevStatus = String(prev.status ?? "");

  const expectedRaw = body.expectedStatus == null ? "" : String(body.expectedStatus).trim();
  if (expectedRaw && expectedRaw !== prevStatus) {
    return NextResponse.json(
      { ok: false, error: "status_conflict", current_status: prevStatus },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {};
  let transitionKind: "review" | "reopen" | null = null;
  let reason: string | null = null;
  if (statusRaw && statusRaw !== prevStatus) {
    if (!isCommunityReportStatus(prevStatus)) {
      return NextResponse.json({ ok: false, error: "invalid_transition" }, { status: 400 });
    }
    if (!isCommunityReportStatus(statusRaw)) {
      return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
    }
    const t = resolveCommunityReportPatchTransition(prevStatus, statusRaw, admin.actor.isSuperAdmin);
    if (!t.ok) {
      return NextResponse.json(
        { ok: false, error: t.error, current_status: prevStatus },
        { status: t.error === "reopen_super_admin_only" ? 403 : 400 }
      );
    }
    transitionKind = t.kind;
    if (t.kind === "reopen") {
      reason = normalizeCommunityAdminReason(body.reason);
      if (!reason) {
        return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
      }
      update.processed_at = null;
      update.processed_by = null;
    }
    update.status = statusRaw;
  }
  if (memoProvided) update.admin_memo = memo;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, status: prevStatus, unchanged: true });
  }

  // CAS: 읽은 상태 그대로일 때만 반영 — 동시 처리와 겹치지 않게
  const { data: changed, error } = await sb
    .from("community_reports")
    .update(update)
    .eq("id", rid)
    .eq("status", prevStatus)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!changed || (changed as unknown[]).length === 0) {
    return NextResponse.json({ ok: false, error: "status_conflict" }, { status: 409 });
  }

  const nextStatus = (update.status as string | undefined) ?? prevStatus;
  const action =
    transitionKind === "review"
      ? "community_report.status_reviewing"
      : transitionKind === "reopen"
        ? "community_report.reopen"
        : "community_report.memo_update";
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_report",
    targetId: rid,
    action,
    reason,
    before: {
      status: prevStatus,
      target_type: prev.target_type ?? null,
      target_id: prev.target_id ?? null,
      ...(memoProvided ? { admin_memo: prev.admin_memo ?? null } : {}),
    },
    after: {
      status: nextStatus,
      ...(memoProvided ? { admin_memo: memo } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    ...(audit.ok ? {} : { auditWarning: true }),
  });
}
