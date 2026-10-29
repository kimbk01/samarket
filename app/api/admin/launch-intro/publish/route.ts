import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";
import { publishLaunchIntroDraft } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUBLISH = immutable publication + Live pointer. Body: { draftId, version, eligibility? } (schedule, P5) */
export async function POST(req: NextRequest) {
  // G-18: 앱 공통 설정 쓰기 = settings 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { draftId?: unknown; version?: unknown; eligibility?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.draftId !== "string" || typeof body.version !== "number") {
    return NextResponse.json({ ok: false, error: "draft_required" }, { status: 400 });
  }
  // R2 — 게시(노출 시작, L2)는 처리 사유 필수. 감사 after.reason 에 남긴다.
  const reason = parseAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  const res = await publishLaunchIntroDraft(sb, {
    draftId: body.draftId,
    expectedVersion: body.version,
    eligibility: body.eligibility ?? null,
    actor: admin.userId ?? null,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "launch_intro",
    targetId: body.draftId,
    action: "launch_intro.publish",
    after: { draftId: body.draftId, expectedVersion: body.version, hasEligibility: body.eligibility != null, reason },
  });
  const snap = await launchIntroAdminSnapshot(sb);
  if (!snap.ok) return NextResponse.json({ ok: false, error: snap.error }, { status: 500 });
  return NextResponse.json(snap);
}
