import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  checkOsLaunchLogo,
  isOsLaunchPendingChanged,
  osLaunchBuildLogoPublicUrl,
} from "@/lib/os-launch/contract";
import {
  getOsLaunchBuildConfig,
  loadOsLaunchPending,
  removeOsLaunchLogo,
  saveOsLaunchPending,
  signOsLaunchLogoUrl,
  uploadOsLaunchLogo,
} from "@/lib/os-launch/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R17-OS admin: upload the NEXT BUILD logo (transparent PNG). Apps never read it at runtime. */
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
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkOsLaunchLogo(bytes);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });

  const loaded = await loadOsLaunchPending(sb);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  const build = getOsLaunchBuildConfig();
  const backgroundColor = loaded.pending?.backgroundColor ?? build.backgroundColor;

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `pending/${randomUUID()}.png`;
  const uploaded = await uploadOsLaunchLogo(sb, path, bytes);
  if (!uploaded.ok) return NextResponse.json({ ok: false, error: uploaded.error }, { status: 500 });

  const saved = await saveOsLaunchPending(
    sb,
    {
      backgroundColor,
      logo: { source: path, width: check.info.width, height: check.info.height, sha256 },
    },
    admin.userId
  );
  if (!saved.ok) {
    await removeOsLaunchLogo(sb, path);
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  const previousPath = loaded.pending?.logo?.source;
  if (previousPath && previousPath !== path) await removeOsLaunchLogo(sb, previousPath);

  return NextResponse.json({
    ok: true as const,
    build: { ...build, logoUrl: osLaunchBuildLogoPublicUrl(build.logo.source) },
    pending: { ...saved.pending, logoUrl: await signOsLaunchLogoUrl(sb, path) },
    pendingChanged: isOsLaunchPendingChanged(build, saved.pending),
    applyModel: "next_native_build" as const,
  });
}
