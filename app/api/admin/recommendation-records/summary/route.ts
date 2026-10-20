import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { manilaTodayStartUtcIso } from "@/lib/admin/metrics/manila-period";
import { loadRecommendationExperimentsBundleFromDb } from "@/lib/recommendation-experiments/recommendation-experiments-db";
import {
  buildExperimentImpressionUserGroups,
  loadRecommendationRecordsSummary,
} from "@/lib/recommendation-ops/recommendation-records-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/recommendation-records/summary — 추천 기록 요약 (DB 집계 RPC).
 * 요약 카드(열린 이슈·미확인 알림·오늘 실행) · 보고서 KPI · 자동화 평가 · 실험 성과가 쓰는 값만.
 * 「오늘」 = 마닐라 오늘 0시부터. 실험 그룹 = DB 실험 번들의 배정 회원.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const exp = await loadRecommendationExperimentsBundleFromDb(sb);
    if (!exp.ok && exp.reason !== "missing_table") {
      return NextResponse.json({ ok: false, error: exp.message ?? "experiments_load_failed" }, { status: 500 });
    }
    const userGroups = exp.ok ? buildExperimentImpressionUserGroups(exp.bundle) : [];
    const r = await loadRecommendationRecordsSummary(sb, { sinceIso: manilaTodayStartUtcIso(), userGroups });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, summary: r.value });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
