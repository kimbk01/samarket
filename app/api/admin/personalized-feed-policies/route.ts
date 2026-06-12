import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createDefaultPersonalizedFeedBundle,
  loadPersonalizedFeedBundleFromDb,
  savePersonalizedFeedBundleToDb,
  upsertPersonalizedFeedPolicy,
  type PersonalizedFeedBundleV1,
} from "@/lib/personalized-feed/personalized-feed-db";
import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBundle(x: unknown): x is PersonalizedFeedBundleV1 {
  return x != null && typeof x === "object" && (x as PersonalizedFeedBundleV1).version === 1;
}

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadPersonalizedFeedBundleFromDb(sb);
    if (loaded.ok) {
      return NextResponse.json({ ok: true, bundle: loaded.bundle, source: loaded.source });
    }
    return NextResponse.json({
      ok: true,
      bundle: createDefaultPersonalizedFeedBundle(),
      source: "default",
    });
  } catch {
    return NextResponse.json({ ok: true, bundle: createDefaultPersonalizedFeedBundle(), source: "default" });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { bundle?: unknown; policy?: PersonalizedFeedPolicy };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const loaded = await loadPersonalizedFeedBundleFromDb(sb);
    const base = loaded.ok ? loaded.bundle : createDefaultPersonalizedFeedBundle();

    let nextBundle: PersonalizedFeedBundleV1;
    if (body.policy) {
      nextBundle = upsertPersonalizedFeedPolicy(base, body.policy);
    } else if (isBundle(body.bundle)) {
      nextBundle = body.bundle;
    } else {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const saved = await savePersonalizedFeedBundleToDb(sb, nextBundle);
    if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
    return NextResponse.json({ ok: true, bundle: nextBundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
