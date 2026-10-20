import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminSettingsBundleAudit } from "@/lib/admin/audit/admin-settings-bundle-audit";
import { RELEASE_ARCHIVE_SETTINGS_KEY } from "@/lib/release-archive/release-archive-keys";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import {
  loadReleaseArchiveBundleFromDb,
  saveReleaseArchiveBundleToDb,
} from "@/lib/release-archive/release-archive-db";
import type { ReleaseArchiveBundleV1 } from "@/lib/release-archive/release-archive-state";
import { createDefaultReleaseArchiveBundle } from "@/lib/release-archive/release-archive-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is ReleaseArchiveBundleV1 {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.version === 1 &&
    Array.isArray(o.archives) &&
    Array.isArray(o.archiveItems) &&
    Array.isArray(o.regressionIssues) &&
    Array.isArray(o.learningNotes)
  );
}

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadReleaseArchiveBundleFromDb(sb);
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
        bundle: createDefaultReleaseArchiveBundle(),
        source: "default" as const,
        hint: loaded.message,
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
        bundle: createDefaultReleaseArchiveBundle(),
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
    const saved = await saveReleaseArchiveBundleToDb(sb, body.bundle);
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    }
    await appendAdminSettingsBundleAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      settingsKey: RELEASE_ARCHIVE_SETTINGS_KEY,
      tool: "release-archive",
      bundle: body.bundle,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
