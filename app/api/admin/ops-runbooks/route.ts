import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminSettingsBundleAudit } from "@/lib/admin/audit/admin-settings-bundle-audit";
import { OPS_RUNBOOKS_SETTINGS_KEY } from "@/lib/ops-runbooks/ops-runbooks-keys";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import {
  loadOpsRunbooksBundleFromDb,
  saveOpsRunbooksBundleToDb,
} from "@/lib/ops-runbooks/ops-runbooks-db";
import type { OpsRunbooksBundleV1 } from "@/lib/ops-runbooks/ops-runbooks-state";
import { createDefaultOpsRunbooksBundle } from "@/lib/ops-runbooks/ops-runbooks-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is OpsRunbooksBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.executions);
}

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadOpsRunbooksBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    if (loaded.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultOpsRunbooksBundle(),
        source: "default" as const,
        hint: loaded.message,
      });
    }
    return NextResponse.json({ ok: false, error: loaded.message ?? "load_failed" }, { status: 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isProductionDeploy()) {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultOpsRunbooksBundle(),
        source: "default" as const,
        hint: msg,
      });
    }
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireSuperAdmin();
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
    const saved = await saveOpsRunbooksBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    await appendAdminSettingsBundleAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      settingsKey: OPS_RUNBOOKS_SETTINGS_KEY,
      tool: "ops-runbooks",
      bundle: body.bundle,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
