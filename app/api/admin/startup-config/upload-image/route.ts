import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Intro/System Start presentation asset upload removed (R15 ABSOLUTE ZERO).
 * Boot authority is initialSurface only — no logo/background media writes.
 */
export async function POST() {
  // G-18: 앱 공통 설정 쓰기 = settings 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;

  return NextResponse.json(
    { ok: false, error: "startup_presentation_assets_removed" },
    { status: 410 }
  );
}
