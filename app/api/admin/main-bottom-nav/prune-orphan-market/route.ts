import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { MAIN_BOTTOM_NAV_SETTINGS_KEY } from "@/lib/main-menu/main-bottom-nav-key";
import { pruneOrphanMarketTabsInMainBottomNavValueJson } from "@/lib/main-menu/prune-orphan-market-tabs-main-bottom-nav";
import { resolveMainBottomNavAdminRows } from "@/lib/main-menu/resolve-main-bottom-nav";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * 거래 카테고리 삭제 등으로 `/market/…` 하단 탭이 고아가 된 경우 admin_settings 에서 제거.
 * POST — 본문 없음.
 */
export async function POST(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false as const, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false as const, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("admin_settings") && error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false as const, error: "table_missing" }, { status: 503 });
    }
    console.error("[POST prune-orphan-market]", error);
    return NextResponse.json({ ok: false as const, error: error.message }, { status: 500 });
  }

  const valueJson = row?.value_json ?? null;
  if (valueJson == null || typeof valueJson !== "object") {
    return NextResponse.json({
      ok: true as const,
      changed: false as const,
      removed: 0,
      message: "no_stored_main_bottom_nav",
    });
  }

  let pruned;
  try {
    pruned = await pruneOrphanMarketTabsInMainBottomNavValueJson(sb, valueJson);
  } catch (e) {
    console.error("[POST prune-orphan-market] prune failed", e);
    return NextResponse.json({ ok: false as const, error: "prune_failed" }, { status: 500 });
  }

  if (!pruned.changed) {
    return NextResponse.json({
      ok: true as const,
      changed: false as const,
      removed: pruned.removed,
    });
  }

  const { error: upsertErr } = await sb.from("admin_settings").upsert(
    {
      key: MAIN_BOTTOM_NAV_SETTINGS_KEY,
      value_json: pruned.payload as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (upsertErr) {
    console.error("[POST prune-orphan-market] upsert", upsertErr);
    return NextResponse.json({ ok: false as const, error: upsertErr.message }, { status: 500 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "main_bottom_nav",
    target_id: "global",
    action: "main_bottom_nav.prune_orphan_market",
    before_json: { value_json: valueJson },
    after_json: { value_json: pruned.payload },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({
    ok: true as const,
    changed: true as const,
    removed: pruned.removed,
    items: resolveMainBottomNavAdminRows(pruned.payload),
  });
}
