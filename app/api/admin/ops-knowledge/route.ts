import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminSettingsBundleAudit } from "@/lib/admin/audit/admin-settings-bundle-audit";
import { OPS_KNOWLEDGE_SETTINGS_KEY } from "@/lib/ops-knowledge/ops-knowledge-keys";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import {
  loadOpsKnowledgeBundleFromDb,
  saveOpsKnowledgeBundleToDb,
} from "@/lib/ops-knowledge/ops-knowledge-db";
import type { OpsKnowledgeBundleV1 } from "@/lib/ops-knowledge/ops-knowledge-state";
import { createDefaultOpsKnowledgeBundle } from "@/lib/ops-knowledge/ops-knowledge-state";
import {
  parseAdminJsonListPage,
  sliceAdminJsonList,
  sortAdminJsonListByDateDesc,
  sortAdminJsonListNewestFirst,
} from "@/lib/admin/pagination/admin-json-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is OpsKnowledgeBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.version === 1 &&
    Array.isArray(o.searchLogs) &&
    Array.isArray(o.recommendationLogs) &&
    Array.isArray(o.recentViews)
  );
}

/**
 * `?part=search-logs` · `?part=recommendation-logs` · `?part=recent-views&admin_id=` — 로그만 서버 페이지로 (`limit` 20/50/100 · `offset`) → `{ items, total }` (R7).
 * 파라미터가 없으면 기존 번들 응답 그대로.
 */
export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  const part = req.nextUrl.searchParams.get("part");
  if (part === "search-logs" || part === "recommendation-logs" || part === "recent-views") {
    try {
      const loaded = await loadOpsKnowledgeBundleFromDb(getSupabaseServer());
      if (!loaded.ok && loaded.reason !== "missing_table") {
        return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
      }
      const bundle = loaded.ok ? loaded.bundle : createDefaultOpsKnowledgeBundle();
      const page = parseAdminJsonListPage(req.nextUrl.searchParams);
      /** 화면 스토어와 같은 규칙 — 저장본이 비면 기본 시드 (import 시 빈 배열 → 기본값). */
      const seed = createDefaultOpsKnowledgeBundle();
      const orSeed = <T,>(rows: T[] | undefined, fallback: T[]): T[] => (rows?.length ? rows : fallback);
      if (part === "recent-views") {
        const adminId = String(req.nextUrl.searchParams.get("admin_id") ?? "").trim();
        const views = orSeed(bundle.recentViews, seed.recentViews);
        const rows = adminId ? views.filter((v) => v.adminId === adminId) : views;
        return NextResponse.json({
          ok: true,
          ...sliceAdminJsonList(sortAdminJsonListByDateDesc(rows, (v) => v.viewedAt), page),
        });
      }
      const result =
        part === "search-logs"
          ? sliceAdminJsonList(sortAdminJsonListNewestFirst(orSeed(bundle.searchLogs, seed.searchLogs)), page)
          : sliceAdminJsonList(sortAdminJsonListNewestFirst(orSeed(bundle.recommendationLogs, seed.recommendationLogs)), page);
      return NextResponse.json({ ok: true, ...result });
    } catch {
      return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
    }
  }

  try {
    const sb = getSupabaseServer();
    const loaded = await loadOpsKnowledgeBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    if (loaded.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        bundle: createDefaultOpsKnowledgeBundle(),
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
        bundle: createDefaultOpsKnowledgeBundle(),
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
    const saved = await saveOpsKnowledgeBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    await appendAdminSettingsBundleAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      settingsKey: OPS_KNOWLEDGE_SETTINGS_KEY,
      tool: "ops-knowledge",
      bundle: body.bundle,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
