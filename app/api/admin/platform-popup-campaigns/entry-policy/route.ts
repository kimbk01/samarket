import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  PLATFORM_POPUP_ENTRY_POLICY_CACHE_TAG,
  PLATFORM_POPUP_ENTRY_POLICY_KEY,
  validatePlatformPopupEntryPolicy,
} from "@/lib/platform-popup/entry-policy";
import { loadPlatformPopupEntryPolicyFromStore } from "@/lib/platform-popup/entry-policy-server";
import { sameRevision } from "@/lib/admin/same-revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 진입 감사 PO-8 — 팝업 전체 스위치(켜기/끄기 · 진입당 최대 개수 · 가로 화면) 조회 — 화면(목록)과 같은 관리자 가드 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const p = await loadPlatformPopupEntryPolicyFromStore();
    return NextResponse.json({ ok: true, ...p });
  } catch {
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 503 });
  }
}

/** 저장 — 읽은 판(`expectedRevision`)과 지금 판이 다르면 409 (다른 관리자 저장 덮어쓰기 금지) */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const validated = validatePlatformPopupEntryPolicy(body.policy);
  if (!validated.ok) return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  const expected = body.expectedRevision;
  if (expected !== null && typeof expected !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let current: Awaited<ReturnType<typeof loadPlatformPopupEntryPolicyFromStore>>;
  try {
    current = await loadPlatformPopupEntryPolicyFromStore();
  } catch {
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 503 });
  }
  // 재감사: 판은 시각 값으로 비교(저장 응답 `…Z` · DB 읽기 `…+00:00` 이 같은 시각)
  if (!sameRevision(current.revision, expected)) {
    return NextResponse.json({ ok: false, error: "stale_revision", revision: current.revision }, { status: 409 });
  }

  const nextUpdatedAt = new Date().toISOString();
  const value = validated.policy as unknown as Record<string, unknown>;
  if (expected === null) {
    const { error } = await sb
      .from("admin_settings")
      .insert({ key: PLATFORM_POPUP_ENTRY_POLICY_KEY, value_json: value, updated_at: nextUpdatedAt });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ ok: false, error: "stale_revision" }, { status: 409 });
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  } else {
    const { data, error } = await sb
      .from("admin_settings")
      .update({ value_json: value, updated_at: nextUpdatedAt })
      .eq("key", PLATFORM_POPUP_ENTRY_POLICY_KEY)
      .eq("updated_at", current.revision as string)
      .select("key");
    if (error) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "stale_revision" }, { status: 409 });
  }

  const rm = getAuditRequestMeta(req);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "platform_popup_entry_policy",
    target_id: "global",
    action: "platform_popup.entry_policy_update",
    before_json: { policy: current.policy },
    after_json: { policy: validated.policy },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });
  revalidateTag(PLATFORM_POPUP_ENTRY_POLICY_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, policy: validated.policy, revision: nextUpdatedAt });
}
