import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";
import { setLaunchIntroLiveState, type LaunchIntroStateAction } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly LaunchIntroStateAction[] = ["pause", "resume", "unpublish", "reactivate"];

/** LIVE STATE MACHINE. Body: { action, publicationId? } — rejected transitions return 409. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { action?: unknown; publicationId?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = body.action as LaunchIntroStateAction;
  if (!ACTIONS.includes(action)) return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  // R2 — 일시정지(노출 중지, L1)만 사유 선택. 재개·재게시(L2)·게시 중단(L3)은 사유 필수 → 감사 after.reason.
  const reason = parseAdminReason(body.reason);
  if (action !== "pause" && !reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }
  const res = await setLaunchIntroLiveState(sb, {
    action,
    publicationId: typeof body.publicationId === "string" ? body.publicationId : null,
    actor: admin.userId ?? null,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "launch_intro_live",
    targetId: typeof body.publicationId === "string" ? body.publicationId : "global",
    action: `launch_intro_live.${action}`,
    after: { action, reason },
  });
  const snap = await launchIntroAdminSnapshot(sb);
  if (!snap.ok) return NextResponse.json({ ok: false, error: snap.error }, { status: 500 });
  return NextResponse.json(snap);
}
