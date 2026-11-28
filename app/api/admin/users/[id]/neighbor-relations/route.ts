import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberDisplayLabelFromRow,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 한 방향 최대 표시 행 — 맺은 쪽은 상한 100, 받은 쪽은 운영 규모(2026-11-28 전체 14행) 기준 여유 */
const MAX_ROWS = 200;

type Row = { id: string; peerId: string; createdAt: string };

export type AdminNeighborRelationItem = {
  id: string;
  peerId: string;
  name: string;
  dibayId: string | null;
  status: string | null;
  createdAt: string;
};

/**
 * 어드민 회원 상세 › 커뮤니티 › 관심이웃 (관심이웃 설계 E · 레거시 FAQ 102 「사용자 요청 시 노출 삭제」).
 * GET: 이 회원이 추가한(outgoing) · 이 회원을 추가한(incoming) 관계. DELETE ?id=: 그 회원이 낀 관계 행 1개 삭제 + 감사 기록.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const { sb } = gate;

  const [outRes, inRes] = await Promise.all([
    sb
      .from("user_relationships")
      .select("id, target_user_id, created_at", { count: "exact" })
      .eq("user_id", userId)
      .eq("type", "neighbor_follow")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    sb
      .from("user_relationships")
      .select("id, user_id, created_at", { count: "exact" })
      .eq("target_user_id", userId)
      .eq("type", "neighbor_follow")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
  ]);
  if (outRes.error) return internalErrorResponse("neighbor_fetch_failed", "[admin neighbor-relations GET out]", outRes.error);
  if (inRes.error) return internalErrorResponse("neighbor_fetch_failed", "[admin neighbor-relations GET in]", inRes.error);

  const outgoing: Row[] = ((outRes.data ?? []) as Array<{ id: string; target_user_id: string; created_at: string }>).map(
    (r) => ({ id: String(r.id), peerId: String(r.target_user_id), createdAt: String(r.created_at ?? "") }),
  );
  const incoming: Row[] = ((inRes.data ?? []) as Array<{ id: string; user_id: string; created_at: string }>).map((r) => ({
    id: String(r.id),
    peerId: String(r.user_id),
    createdAt: String(r.created_at ?? ""),
  }));

  const peerIds = [...new Set([...outgoing, ...incoming].map((r) => r.peerId))];
  const profileById = new Map<string, Record<string, unknown>>();
  if (peerIds.length > 0) {
    const { data: profiles } = await sb
      .from("profiles")
      .select(`${MEMBER_IDENTITY_PROFILE_SELECT}, status`)
      .in("id", peerIds);
    for (const p of (profiles ?? []) as unknown as Record<string, unknown>[]) {
      profileById.set(String(p.id), p);
    }
  }
  const toItem = (r: Row): AdminNeighborRelationItem => {
    const p = profileById.get(r.peerId);
    return {
      id: r.id,
      peerId: r.peerId,
      name: p ? memberDisplayLabelFromRow(p as MemberIdentityProfileFields, { userId: r.peerId }) : r.peerId,
      dibayId: typeof p?.dibay_id === "string" && p.dibay_id.trim() ? p.dibay_id.trim() : null,
      status: typeof p?.status === "string" ? p.status : null,
      createdAt: r.createdAt,
    };
  };

  return NextResponse.json({
    ok: true,
    outgoing: { total: outRes.count ?? outgoing.length, items: outgoing.map(toItem) },
    incoming: { total: inRes.count ?? incoming.length, items: incoming.map(toItem) },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const userId = id?.trim() ?? "";
  const relationId = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId) || !isAdminMemberUuidSearch(relationId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const { sb, actor } = gate;
  let reason = "";
  try {
    const body = (await req.json()) as { reason?: unknown };
    reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  } catch {
    reason = "";
  }
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  /** 이 회원이 낀 관심이웃 행만 — 다른 회원 화면에서 남의 행을 지우지 못하게 */
  const { data: row, error: readErr } = await sb
    .from("user_relationships")
    .select("id, user_id, target_user_id, type, created_at")
    .eq("id", relationId)
    .eq("type", "neighbor_follow")
    .or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
    .maybeSingle();
  if (readErr) return internalErrorResponse("neighbor_remove_failed", "[admin neighbor-relations DELETE read]", readErr);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { error } = await sb.from("user_relationships").delete().eq("id", relationId);
  if (error) return internalErrorResponse("neighbor_remove_failed", "[admin neighbor-relations DELETE]", error);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user",
    target_id: userId,
    action: "neighbor_follow_admin_remove",
    before_json: row as Record<string, unknown>,
    after_json: { deleted: true, relationId, reason, at: new Date().toISOString(), actorId: actor.userId },
  });
  return NextResponse.json({ ok: true });
}
