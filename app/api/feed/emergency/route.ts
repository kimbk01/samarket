import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { loadFeedEmergencyBundleFromDb } from "@/lib/feed-emergency/feed-emergency-db";
import { computeFeedEmergencyPublicSnapshot, createDefaultFeedEmergencyBundle } from "@/lib/feed-emergency/feed-emergency-state";
import type { RecommendationSurface } from "@/lib/types/recommendation";

export const dynamic = "force-dynamic";

const SURFACES = new Set<RecommendationSurface>(["home", "search", "shop"]);

/**
 * GET /api/feed/emergency?surface=home
 * 피드 킬스위치·공지·섹션 비활성 스냅샷 (인증 불필요, 서비스 롤로 admin_settings 조회)
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("surface")?.trim() ?? "home";
  const surface = (SURFACES.has(raw as RecommendationSurface) ? raw : "home") as RecommendationSurface;

  try {
    const sb = getSupabaseServer();
    const loaded = await loadFeedEmergencyBundleFromDb(sb);
    const bundle = loaded.ok ? loaded.bundle : createDefaultFeedEmergencyBundle();
    const snap = computeFeedEmergencyPublicSnapshot(bundle, surface);
    return NextResponse.json(
      { ok: true, surface, ...snap },
      {
        headers: {
          "Cache-Control": "private, no-store, must-revalidate",
        },
      }
    );
  } catch {
    const bundle = createDefaultFeedEmergencyBundle();
    const snap = computeFeedEmergencyPublicSnapshot(bundle, surface);
    if (!isProductionDeploy()) {
      return NextResponse.json({ ok: true, surface, ...snap, meta: { source: "default" } });
    }
    return NextResponse.json(
      { ok: true, surface, ...snap, meta: { source: "default", degraded: true } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
