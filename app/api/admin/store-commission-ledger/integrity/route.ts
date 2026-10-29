import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { loadStoreCommissionIntegrity } from "@/lib/stores/commission/load-store-commission-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 수수료·캐시 원장 불변식 검사 (읽기 전용, DB 함수 store_commission_integrity_report). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const storeId = req.nextUrl.searchParams.get("store_id")?.trim() ?? "";
  try {
    const report = await loadStoreCommissionIntegrity(gate.sb, storeId ? [storeId] : null);
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    return internalErrorResponse("load_failed", "[admin/store-commission-ledger/integrity]", e);
  }
}
