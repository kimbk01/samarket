import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { storeHasAgreedToVersion } from "@/lib/stores/partner/store-partner-agreement-contract";
import {
  hasAnyPublishedStorePartnerTerms,
  listStorePartnerAgreements,
  loadCurrentStorePartnerTerms,
  loadLegalDocumentsByIds,
  loadStoreLaunchFreeOverride,
  loadStoreLaunchFreePolicy,
} from "@/lib/stores/partner/store-partner-agreement.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장 1곳의 입점 계약 — 동의 기록(최신순)·동의한 버전 원문·어드민 무료 종료일·현재 오픈 기념 무료 정책.
 * 조회 전용 (무료 종료일 수정은 PATCH /api/admin/stores/[id] action `set_launch_free_until`).
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id: raw } = await context.params;
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const [list, ov, published, current, policy] = await Promise.all([
    listStorePartnerAgreements(sb, id),
    loadStoreLaunchFreeOverride(sb, id),
    hasAnyPublishedStorePartnerTerms(sb),
    loadCurrentStorePartnerTerms(sb, "ko"),
    loadStoreLaunchFreePolicy(sb, id),
  ]);
  if (!list.ok || !ov.ok || !published.ok || !current.ok) {
    return internalErrorResponse("load_failed", "[admin/stores/[id]/partner-agreement GET]", "read_failed", 500);
  }
  const documents = await loadLegalDocumentsByIds(
    sb,
    list.rows.map((r) => r.legalDocumentId)
  );
  const currentVersion = current.terms?.version ?? null;
  return NextResponse.json({
    ok: true as const,
    termsPublished: published.published,
    currentVersion,
    agreedCurrentVersion: storeHasAgreedToVersion(list.rows, currentVersion),
    agreements: list.rows,
    documents,
    override: ov.override,
    launchPolicy: policy,
  });
}
