import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadRecommendationExperimentsBundleFromDb } from "@/lib/recommendation-experiments/recommendation-experiments-db";
import { createDefaultRecommendationExperimentsBundle } from "@/lib/recommendation-experiments/recommendation-experiments-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 공개 읽기: 피드 실험·운영 버전 컨텍스트 (비밀 정보 없음) */
export async function GET(): Promise<NextResponse> {
  try {
    const sb = getSupabaseServer();
    const loaded = await loadRecommendationExperimentsBundleFromDb(sb);
    const bundle = loaded.ok ? loaded.bundle : createDefaultRecommendationExperimentsBundle();
    return NextResponse.json({
      ok: true,
      feedVersions: bundle.feedVersions,
      experiments: bundle.experiments.filter((e) => e.status === "running"),
      activeFeedVersions: bundle.activeFeedVersions,
    });
  } catch {
    const bundle = createDefaultRecommendationExperimentsBundle();
    return NextResponse.json({
      ok: true,
      feedVersions: bundle.feedVersions,
      experiments: bundle.experiments.filter((e) => e.status === "running"),
      activeFeedVersions: bundle.activeFeedVersions,
    });
  }
}
