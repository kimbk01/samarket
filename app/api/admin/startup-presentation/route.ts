import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  createR15StartupGeneration,
  loadR15CurrentGeneration,
  loadR15StartupDraft,
  saveR15StartupDraft,
} from "@/lib/startup-presentation/db";
import { validateStartupPresentationDocument } from "@/lib/startup-presentation/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const [draft, current] = await Promise.all([
    loadR15StartupDraft(sb),
    loadR15CurrentGeneration(sb),
  ]);
  if (!draft.ok) return NextResponse.json({ ok: false, error: draft.error }, { status: 500 });
  if (!current.ok) return NextResponse.json({ ok: false, error: current.error }, { status: 500 });
  return NextResponse.json({
    ok: true as const,
    draft: draft.document,
    draftSource: draft.source,
    currentGeneration: current.manifest,
  });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { document?: unknown } | null;
  const validated = validateStartupPresentationDocument(body?.document);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  const saved = await saveR15StartupDraft(sb, {
    document: validated.document,
    userId: admin.userId,
  });
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  return NextResponse.json({ ok: true as const, draft: saved.document });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { action?: string; document?: unknown } | null;
  if (body?.action !== "service_apply") {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  const validated = validateStartupPresentationDocument(body.document);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  const generation = await createR15StartupGeneration(sb, {
    document: validated.document,
    userId: admin.userId,
  });
  if (!generation.ok) {
    return NextResponse.json({ ok: false, error: generation.error }, { status: 500 });
  }
  await saveR15StartupDraft(sb, { document: validated.document, userId: admin.userId });
  return NextResponse.json({ ok: true as const, manifest: generation.manifest });
}
