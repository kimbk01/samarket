import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { listStoreApplicationEvents } from "@/lib/stores/store-application-events.server";
import { findStoreNameDuplicates } from "@/lib/stores/store-application-input.server";
import { storeBaseNameWithoutBranch } from "@/lib/stores/store-application-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 입점 심사 패널 — 신청 상세 보조 (매장 신청 v2 · Owner 2026-11-10). 읽기 전용 · 조회 권한 = 관리자 전체.
 * - 처리 이력(store_application_events) · 같은 이름 매장(본 이름 기준) · 신청자 회원 전화(프로필).
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id, store_name, branch_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  if (!store) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });

  const ownerId = typeof store.owner_user_id === "string" ? store.owner_user_id : null;
  const baseName = storeBaseNameWithoutBranch(String(store.store_name ?? ""), store.branch_name as string | null);
  const [events, dups, member] = await Promise.all([
    listStoreApplicationEvents(sb, id),
    findStoreNameDuplicates(sb, baseName, id),
    ownerId
      ? sb.from("profiles").select("phone, phone_verified").eq("id", ownerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const m = (member as { data: { phone?: string | null; phone_verified?: boolean | null } | null }).data;
  return NextResponse.json({
    ok: true,
    events: events.ok ? events.rows : [],
    nameDuplicates: dups.ok ? dups.rows : [],
    memberPhone: m?.phone ?? null,
    memberPhoneVerified: m?.phone_verified === true,
  });
}
