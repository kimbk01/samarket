import type { NextRequest } from "next/server";
import { handleAdminAdUndelete } from "@/lib/admin/ads-delete/admin-ad-delete-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ads/undelete — 삭제 취소 (A-2 · L2 · R2 · 2026-11-07)
 * body: { kind, id, reason } · 권한 = 삭제와 같은 권한 표 · 사유 2자 이상 필수.
 * 삭제 표시만 되돌린다(종료·환급은 되돌리지 않는다) — DB 함수 `admin_ad_undelete` 1번 · 감사 1행.
 */
export async function POST(req: NextRequest) {
  return handleAdminAdUndelete(req);
}
