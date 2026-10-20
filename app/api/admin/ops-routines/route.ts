import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminSettingsBundleAudit } from "@/lib/admin/audit/admin-settings-bundle-audit";
import { OPS_ROUTINES_SETTINGS_KEY } from "@/lib/ops-routines/ops-routines-keys";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import {
  loadOpsRoutinesBundleFromDb,
  saveOpsRoutinesBundleToDb,
} from "@/lib/ops-routines/ops-routines-db";
import type { OpsRoutinesBundleV1 } from "@/lib/ops-routines/ops-routines-state";
import { createDefaultOpsRoutinesBundle } from "@/lib/ops-routines/ops-routines-state";
import {
  parseAdminJsonListPage,
  sliceAdminJsonList,
  sortAdminJsonListByDateDesc,
} from "@/lib/admin/pagination/admin-json-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is OpsRoutinesBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.version === 1 &&
    Array.isArray(o.routineTemplates) &&
    Array.isArray(o.routineExecutions) &&
    Array.isArray(o.monthlyNotes)
  );
}

/**
 * `?part=executions` — 해당 목록만 서버 페이지로 (`limit` 20/50/100 · `offset`) → `{ items, total }` (R7, 화면 고정 상한 없음).
 * 파라미터가 없으면 기존 번들 응답 그대로.
 */
export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const part = sp.get("part");
  if (part) {
    try {
      const loaded = await loadOpsRoutinesBundleFromDb(getSupabaseServer());
      if (!loaded.ok && loaded.reason !== "missing_table") {
        return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
      }
      const b = loaded.ok ? loaded.bundle : createDefaultOpsRoutinesBundle();
      const page = parseAdminJsonListPage(sp);
      if (part === "executions") {
        const all = b.routineExecutions ?? [];
        const periodType = String(sp.get("period") ?? "").trim();
        const status = String(sp.get("exec_status") ?? sp.get("status") ?? "").trim();
        const rows = all.filter(
          (e) => (!periodType || e.periodType === periodType) && (!status || e.status === status)
        );
        return NextResponse.json({
          ok: true,
          ...sliceAdminJsonList(sortAdminJsonListByDateDesc(rows, (r) => r.scheduledDate), page),
        });
      }
      return NextResponse.json({ ok: false, error: "invalid_part" }, { status: 400 });
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
    }
  }

  try {
    const sb = getSupabaseServer();
    const loaded = await loadOpsRoutinesBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    if (loaded.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultOpsRoutinesBundle(),
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
        bundle: createDefaultOpsRoutinesBundle(),
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
    const saved = await saveOpsRoutinesBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    await appendAdminSettingsBundleAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      settingsKey: OPS_ROUTINES_SETTINGS_KEY,
      tool: "ops-routines",
      bundle: body.bundle,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
