import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  createLaunchIntroDraftUpload,
  finalizeLaunchIntroDraftUpload,
  signLaunchIntroDraftImage,
} from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Draft asset upload (private bucket), two steps so files never pass through the function body:
 *   { action: "start", mime, bytes }  → { path, signedUrl }   (browser PUTs the file to signedUrl)
 *   { action: "finish", path }        → { kind, ref, url }   (server inspects the stored bytes)
 * The server-side asset authority decides type / size / codec; rejected objects are deleted.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let body: { action?: unknown; mime?: unknown; bytes?: unknown; path?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action === "start") {
    const res = await createLaunchIntroDraftUpload(sb, { mime: body.mime, bytes: body.bytes });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
    return NextResponse.json({ ok: true, path: res.path, signedUrl: res.signedUrl });
  }
  if (body.action === "finish") {
    const res = await finalizeLaunchIntroDraftUpload(sb, body.path);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
    const url = res.ref.draftPath ? await signLaunchIntroDraftImage(sb, res.ref.draftPath) : null;
    return NextResponse.json({ ok: true, kind: res.kind, ref: res.ref, url });
  }
  return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
}
