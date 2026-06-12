import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createDefaultHomeFeedBundle,
  loadHomeFeedBundleFromDb,
  saveHomeFeedBundleToDb,
  upsertHomeFeedPolicy,
  type HomeFeedBundleV1,
} from "@/lib/home-feed/home-feed-db";
import type { HomeFeedPolicy } from "@/lib/types/home-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is HomeFeedBundleV1 {
  return x != null && typeof x === "object" && (x as HomeFeedBundleV1).version === 1;
}

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadHomeFeedBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    return NextResponse.json({
      ok: true,
      bundle: createDefaultHomeFeedBundle(),
      source: "default",
      hint: loaded.message,
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      bundle: createDefaultHomeFeedBundle(),
      source: "default",
      hint: String(e),
    });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { bundle?: unknown; policy?: HomeFeedPolicy };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const loaded = await loadHomeFeedBundleFromDb(sb);
    const base = loaded.ok ? loaded.bundle : createDefaultHomeFeedBundle();

    let nextBundle: HomeFeedBundleV1;
    if (body.policy) {
      nextBundle = upsertHomeFeedPolicy(base, body.policy);
    } else if (isBundle(body.bundle)) {
      nextBundle = body.bundle;
    } else {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const saved = await saveHomeFeedBundleToDb(sb, nextBundle);
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    return NextResponse.json({ ok: true, bundle: nextBundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
