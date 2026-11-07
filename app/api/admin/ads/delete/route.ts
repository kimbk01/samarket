import type { NextRequest } from "next/server";
import { handleAdminAdDelete } from "@/lib/admin/ads-delete/admin-ad-delete-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ads/delete — 광고 삭제 (설계 §3-2 · R2 · 2026-11-07)
 * body: { kind, id, reason, fault?: "operator"|"advertiser", preview?: true }
 * 권한 = 권한 표(배달 광고·사장님 팝업 = business · 그 밖 = ads) · 사유 2자 이상 필수 · 대상 재입력 없음.
 * 상태별 완전 삭제 / 삭제 표시 / 종료 + 삭제 표시를 DB 함수 `admin_ad_delete` 1번(한 트랜잭션 · 감사 1행)으로 처리한다.
 * preview=true 는 쓰기 없이 방식·환급 예정만 돌려준다.
 * → { ok, preview, kind, id, plan: { mode, refundAmount, paidAmount, refundUnit, needsFault } }
 */
export async function POST(req: NextRequest) {
  return handleAdminAdDelete(req);
}
