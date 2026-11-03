import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  advertisingWorkspaceMemoTargetType,
  requireAdvertisingWorkspaceFamilyGate,
} from "@/lib/admin/advertising-workspace/workspace-memo-gate";
import type { WorkspaceEntityFamily } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAMILIES: readonly WorkspaceEntityFamily[] = [
  "delivery_banner",
  "delivery_sponsored",
  "platform_popup_request",
  "feed_banner",
  "platform_popup_campaign",
  "boost_trade",
  "boost_community",
];

/**
 * GET /api/admin/advertising-workspace/memos?family=&entityId=
 * 광고 감사 A-9: 저장만 되고 볼 곳이 없던 내부 메모(`audit_logs` action=advertising.internal_memo)를
 * 같은 계열 권한으로 읽는다. 최신 50건.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const family = String(req.nextUrl.searchParams.get("family") ?? "").trim() as WorkspaceEntityFamily;
  const entityId = String(req.nextUrl.searchParams.get("entityId") ?? "").trim();
  if (!FAMILIES.includes(family) || !entityId) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const gate = await requireAdvertisingWorkspaceFamilyGate(family, { internalMemo: true });
  if (gate && !gate.ok) return gate.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { data, error } = await sb
    .from("audit_logs")
    .select("actor_id, after_json, created_at")
    .eq("action", "advertising.internal_memo")
    .eq("target_type", advertisingWorkspaceMemoTargetType(family))
    .eq("target_id", entityId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });

  const memos = (data ?? []).map((row) => {
    const r = row as { actor_id?: unknown; after_json?: { memo?: unknown } | null; created_at?: unknown };
    return {
      adminId: String(r.actor_id ?? ""),
      memo: String(r.after_json?.memo ?? ""),
      createdAt: String(r.created_at ?? ""),
    };
  });
  return NextResponse.json({ ok: true, memos });
}
