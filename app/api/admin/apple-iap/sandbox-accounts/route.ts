import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { APPLE_IAP_SANDBOX_POINT_CAP, appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/apple-iap/sandbox-accounts — Apple 테스트 결제(Sandbox) 지급 허용 계정 + 계정별 누적 테스트 지급.
 * POST { userId, note, active } — 등록(active=true)·해제(active=false). DB 함수가 최고관리자·메모·누적 상한을 강제한다.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.sb
    .from("apple_iap_sandbox_accounts")
    .select("user_id, note, added_at, revoked_at")
    .order("added_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<{ user_id: string; note: string; added_at: string; revoked_at: string | null }>;
  const userIds = rows.map((r) => r.user_id);
  const [profiles, credited] = await Promise.all([
    userIds.length
      ? guard.sb.from("profiles").select("id, nickname").in("id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    userIds.length
      ? guard.sb
          .from("apple_iap_transactions")
          .select("user_id, point_amount")
          .in("user_id", userIds)
          .eq("environment", "Sandbox")
          .eq("status", "credited")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const nick = new Map(((profiles.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), String(p.nickname ?? "")]));
  const used = new Map<string, number>();
  for (const t of (credited.data ?? []) as Record<string, unknown>[]) {
    const uid = String(t.user_id);
    used.set(uid, (used.get(uid) ?? 0) + Math.max(0, Math.trunc(Number(t.point_amount) || 0)));
  }
  return NextResponse.json({
    ok: true,
    capPoints: APPLE_IAP_SANDBOX_POINT_CAP,
    rows: rows.map((r) => ({
      userId: r.user_id,
      nickname: nick.get(r.user_id) ?? null,
      note: r.note,
      addedAt: r.added_at,
      revokedAt: r.revoked_at,
      usedPoints: used.get(r.user_id) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const userId = String(body.userId ?? "").trim();
  const note = String(body.note ?? "").trim();
  const active = body.active === true;
  if (!appleIapIsUuid(userId) || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const { data, error } = await guard.sb.rpc("apple_iap_sandbox_account_set", {
    p_admin_user_id: guard.actor.userId,
    p_user_id: userId,
    p_note: note,
    p_active: active,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return NextResponse.json({ ok: false, error: String(r.error ?? "update_failed") }, { status: 409 });
  }
  await appendAdminRouteAudit(guard.sb, req, {
    actorId: guard.actor.userId,
    targetType: "apple_iap_sandbox_account",
    targetId: userId,
    action: active ? "apple_iap.sandbox_account.add" : "apple_iap.sandbox_account.revoke",
    after: { active, note: active ? note : null },
  });
  return NextResponse.json({ ok: true });
}
