import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  loadOsEntryAdminSnapshot,
  saveOsEntryDraft,
} from "@/lib/os-entry/db";
import { normalizeOsEntryConfig } from "@/lib/os-entry/normalize";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const loaded = await loadOsEntryAdminSnapshot(sb);
  if (!loaded.ok) {
    if (loaded.reason === "missing_table") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: loaded.message ?? "error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    draft: loaded.snapshot.draft,
    live: loaded.snapshot.live,
  });
}

/** SAVE → DRAFT only. Does not bump LIVE revision. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const configRaw =
    body && typeof body === "object" && "config" in (body as object)
      ? (body as { config: unknown }).config
      : body;

  const saved = await saveOsEntryDraft(sb, normalizeOsEntryConfig(configRaw), admin.userId);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  const snap = await loadOsEntryAdminSnapshot(sb);
  return NextResponse.json({
    ok: true as const,
    draft: saved.config,
    live: snap.ok ? snap.snapshot.live : null,
  });
}
