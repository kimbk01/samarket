import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Intro/System Start presentation asset upload removed (R15 ABSOLUTE ZERO).
 * Boot authority is initialSurface only — no logo/background media writes.
 */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  return NextResponse.json(
    { ok: false, error: "startup_presentation_assets_removed" },
    { status: 410 }
  );
}
