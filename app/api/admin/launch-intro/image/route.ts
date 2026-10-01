import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { signLaunchIntroDraftImage, uploadLaunchIntroDraftImage } from "@/lib/launch-intro/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Draft image upload (private). Returns the image reference + a short-lived preview URL. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const res = await uploadLaunchIntroDraftImage(sb, new Uint8Array(await file.arrayBuffer()));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status ?? 500 });
  const url = res.image.draftPath ? await signLaunchIntroDraftImage(sb, res.image.draftPath) : null;
  return NextResponse.json({ ok: true, image: res.image, url });
}
