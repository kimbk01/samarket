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
import {
  parseAdminJsonListPage,
  sliceAdminJsonList,
  sortAdminJsonListByDateDesc,
} from "@/lib/admin/pagination/admin-json-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is OpsRunbooksBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.executions);
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
      const loaded = await loadOpsRunbooksBundleFromDb(getSupabaseServer());
      if (!loaded.ok && loaded.reason !== "missing_table") {
        return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
      }
      const b = loaded.ok ? loaded.bundle : createDefaultOpsRunbooksBundle();
      const page = parseAdminJsonListPage(sp);
      if (part === "executions") {
        /** 화면 스토어와 같은 규칙 — 저장본이 비면 기본 시드를 보여 준다 (import 시 빈 배열 → 기본값). */
        const all = b.executions?.length ? b.executions : createDefaultOpsRunbooksBundle().executions;
        const status = String(sp.get("status") ?? "").trim();
        const rows = status ? all.filter((e) => e.executionStatus === status) : all;
        return NextResponse.json({
          ok: true,
          ...sliceAdminJsonList(sortAdminJsonListByDateDesc(rows, (r) => r.startedAt), page),
        });
      }
      return NextResponse.json({ ok: false, error: "invalid_part" }, { status: 400 });
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
    }
  }

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
