import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AdminGuard UI — 서버 `isRouteAdmin()`과 동일 기준 (test-login·쿠키·DB role) */
export async function GET() {
  const ok = await isRouteAdmin();
  return NextResponse.json({ ok });
}
