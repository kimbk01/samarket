import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { loadDrOpsBundleFromDb, saveDrOpsBundleToDb } from "@/lib/dr/dr-db";
import type { DrOpsBundleV1 } from "@/lib/dr/dr-state";
import { createDefaultDrOpsBundle } from "@/lib/dr/dr-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is DrOpsBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.scenarios);
}

/** 관리자: DR 운영 상태 조회 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadDrOpsBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({
        ok: true,
        bundle: loaded.bundle,
        source: loaded.source,
      });
    }
    if (loaded.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultDrOpsBundle(),
        source: "default" as const,
        hint: loaded.message ?? "admin_settings 없음",
      });
    }
    return NextResponse.json(
      { ok: false, error: loaded.message ?? "load_failed" },
      { status: 500 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isProductionDeploy()) {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultDrOpsBundle(),
        source: "default" as const,
        hint: msg,
      });
    }
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}

/** 관리자: DR 운영 상태 저장 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { bundle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isBundle(body.bundle)) {
    return NextResponse.json({ ok: false, error: "invalid_bundle" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const saved = await saveDrOpsBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
