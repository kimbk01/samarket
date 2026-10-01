import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isOsLaunchPendingChanged,
  normalizeOsLaunchHex,
  osLaunchBuildLogoPublicUrl,
  type OsLaunchPending,
} from "@/lib/os-launch/contract";
import {
  getOsLaunchBuildConfig,
  loadOsLaunchPending,
  removeOsLaunchLogo,
  saveOsLaunchPending,
  signOsLaunchLogoUrl,
} from "@/lib/os-launch/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sb = NonNullable<ReturnType<typeof tryGetSupabaseForStores>>;

/** R17-OS admin: CURRENT BUILD (repo) vs NEXT BUILD / PENDING (DB). Never read by apps. */
async function snapshot(sb: Sb, pending: OsLaunchPending | null) {
  const build = getOsLaunchBuildConfig();
  const pendingLogoUrl = pending?.logo ? await signOsLaunchLogoUrl(sb, pending.logo.source) : null;
  return {
    ok: true as const,
    build: { ...build, logoUrl: osLaunchBuildLogoPublicUrl(build.logo.source) },
    pending: pending ? { ...pending, logoUrl: pendingLogoUrl } : null,
    pendingChanged: isOsLaunchPendingChanged(build, pending),
    applyModel: "next_native_build" as const,
  };
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const loaded = await loadOsLaunchPending(sb);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  return NextResponse.json(await snapshot(sb, loaded.pending));
}

/**
 * Save NEXT BUILD background color, or reset the pending logo to the current build logo.
 * Body: { backgroundColor: "#RRGGBB", resetLogo?: boolean }
 */
export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { backgroundColor?: unknown; resetLogo?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const color = normalizeOsLaunchHex(body.backgroundColor);
  if (!color) return NextResponse.json({ ok: false, error: "invalid_color" }, { status: 400 });

  const resetLogo = body.resetLogo === true;
  const before = resetLogo ? await loadOsLaunchPending(sb) : null;
  const saved = await saveOsLaunchPending(
    sb,
    { backgroundColor: color, ...(resetLogo ? { logo: null } : {}) },
    admin.userId
  );
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  // Reset → the old pending logo object is no longer referenced; remove it from private storage.
  const oldPath = before?.ok ? before.pending?.logo?.source : undefined;
  if (oldPath) await removeOsLaunchLogo(sb, oldPath);
  return NextResponse.json(await snapshot(sb, saved.pending));
}
