import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listBoardPointPolicies,
  saveBoardPointPolicyDb,
} from "@/lib/points/point-policy-db";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const policies = await listBoardPointPolicies(gate.sb);
    return NextResponse.json({ ok: true, policies });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const raw = (await req.json().catch(() => ({}))) as Partial<BoardPointPolicy> & { reason?: unknown };
  const { reason: rawReason, ...body } = raw;
  // C-19: 포인트 지급 규칙 변경 — 변경 전후 감사. 커뮤니티 화면은 L3 사유를 보낸다.
  // 공통 포인트 정책 화면(/admin/point-policies)은 아직 사유를 보내지 않으므로 서버에서 필수로 막지 않는다.
  const reason = normalizeCommunityAdminReason(rawReason);
  try {
    const { data: beforeRow } = body.id
      ? await gate.sb.from("board_point_policies").select("*").eq("id", body.id).maybeSingle()
      : { data: null };
    const saved = await saveBoardPointPolicyDb(gate.sb, body as BoardPointPolicy);
    await appendCommunityAdminAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "community_point_policy",
      targetId: String(saved.id ?? body.id ?? ""),
      action: body.id ? "community_point_policy.update" : "community_point_policy.create",
      reason,
      before: (beforeRow as Record<string, unknown> | null) ?? null,
      after: saved as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: `${body.id ? "게시판 정책 수정" : "게시판 정책 생성"}${reason ? ` · ${reason}` : ""}`.slice(0, 500),
    });
    return NextResponse.json({ ok: true, policy: saved });
  } catch (e) {
    console.error("[admin/point-policies/board] save failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
