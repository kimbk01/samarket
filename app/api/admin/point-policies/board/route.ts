import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listBoardPointPolicies,
  saveBoardPointPolicyDb,
} from "@/lib/points/point-policy-db";
import {
  auditPointPolicyChange,
  pointPolicyLogNote,
  pointPolicyReasonRequiredResponse,
  readPointPolicyAdminReason,
  readPointPolicyRow,
} from "@/lib/points/point-policy-admin-change";
import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { loadAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 게시판별 포인트 정책. `?include=topics` 면 정책을 걸 주제 목록(id·slug·이름·정렬 탭 여부)도 함께.
 * 포인트 정책 화면은 포인트(point) 권한으로 열리므로 주제 목록도 같은 가드로 준다
 * (커뮤니티 게시판 관리 `content` 권한 API 를 부르면 point 전용 관리자에게 403 — R9).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const policies = await listBoardPointPolicies(gate.sb);
    if (req.nextUrl.searchParams.get("include") !== "topics") return NextResponse.json({ ok: true, policies });
    const { rows, error } = await loadAllCommunityTopicsForAdmin();
    if (error) return NextResponse.json({ ok: false, error: "topics_load_failed" }, { status: 500 });
    const topics = rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, is_feed_sort: t.is_feed_sort === true }));
    return NextResponse.json({ ok: true, policies, topics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const raw = (await req.json().catch(() => ({}))) as Partial<BoardPointPolicy> & { reason?: unknown };
  const { reason: rawReason, ...body } = raw;
  // C-19: 공통 포인트 지급 규칙 변경 — 사유 필수(커뮤니티·공통 화면 모두 L2+ 사유를 보낸다) + 변경 전후 감사.
  const reason = readPointPolicyAdminReason(rawReason);
  if (!reason) return pointPolicyReasonRequiredResponse();
  try {
    const beforeRow = await readPointPolicyRow(gate.sb, "board_point_policies", body.id);
    const saved = await saveBoardPointPolicyDb(gate.sb, body as BoardPointPolicy);
    const auditFlag = await auditPointPolicyChange(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "community_point_policy",
      targetId: String(saved.id ?? body.id ?? ""),
      action: body.id ? "community_point_policy.update" : "community_point_policy.create",
      reason,
      before: beforeRow,
      after: saved as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: pointPolicyLogNote(body.id ? "게시판 정책 수정" : "게시판 정책 생성", reason),
    });
    return NextResponse.json({ ok: true, policy: saved, ...auditFlag });
  } catch (e) {
    console.error("[admin/point-policies/board] save failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
