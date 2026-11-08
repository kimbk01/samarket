import { NextResponse } from "next/server";
import { loadHomeLayoutServerCached } from "@/lib/home/load-home-layout-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 앱 홈 구성 (공개 · 비회원 포함) — 당겨서 새로고침 때 다시 받는다.
 * 저장은 어드민 `PUT /api/admin/home-layout` 만 (저장 시 서버 캐시 태그 무효화).
 */
export async function GET() {
  const { config, revision } = await loadHomeLayoutServerCached();
  return NextResponse.json(
    { ok: true as const, config, revision },
    { headers: { "Cache-Control": "no-store" } }
  );
}
