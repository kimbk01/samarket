import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { launchIntroAdminSnapshot } from "@/lib/launch-intro/admin-snapshot";
import { deleteLaunchIntroDraft, saveLaunchIntroDraft, type Sb } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbOr503() {
  const sb = tryGetSupabaseForStores();
  return sb
    ? { sb }
    : { error: NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 }) };
}

async function respondSnapshot(sb: Sb) {
  const snap = await launchIntroAdminSnapshot(sb);
  if (!snap.ok) return NextResponse.json({ ok: false, error: snap.error }, { status: 500 });
  return NextResponse.json(snap);
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const s = sbOr503();
  if ("error" in s) return s.error;
  return respondSnapshot(s.sb);
}

/** SAVE = DRAFT only. Body: { id: string | null, version: number | null, document } */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const s = sbOr503();
  if ("error" in s) return s.error;
  let body: { id?: unknown; version?: unknown; document?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const saved = await saveLaunchIntroDraft(s.sb, {
    id: typeof body.id === "string" ? body.id : null,
    expectedVersion: typeof body.version === "number" ? body.version : null,
    document: body.document,
    actor: admin.userId ?? null,
  });
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status ?? 500 });
  return respondSnapshot(s.sb);
}

/** DELETE = draft only (published history is never deleted). ?id=<draft id> */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const s = sbOr503();
  if ("error" in s) return s.error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  const res = await deleteLaunchIntroDraft(s.sb, id);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  return respondSnapshot(s.sb);
}
