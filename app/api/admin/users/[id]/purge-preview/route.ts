import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { fetchAuthUserPurgeBlockers } from "@/lib/admin/admin-user-deletion";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { isSuperAdminRole } from "@/lib/admin/admin-user-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only impact preview before permanent delete. No mutation. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const { sb } = gate;
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, nickname, display_name, status, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const membership = await loadActiveAdminMembership(sb, userId).catch(() => null);
  const protectedTarget =
    isSuperAdminRole(membership?.role) || membership?.role === "admin";
  const blockers = await fetchAuthUserPurgeBlockers(sb, userId);
  return NextResponse.json({
    ok: true,
    userId,
    nickname: String((profile as { nickname?: string }).nickname ?? "").trim() || null,
    displayName: String((profile as { display_name?: string }).display_name ?? "").trim() || null,
    status: String((profile as { status?: string }).status ?? ""),
    deletedAt: (profile as { deleted_at?: string | null }).deleted_at ?? null,
    protectedTarget,
    membershipRole: membership?.role ?? null,
    purgeAllowed: blockers.ok && !protectedTarget,
    blockers: blockers.blockers,
  });
}
