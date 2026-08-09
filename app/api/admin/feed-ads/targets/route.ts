import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { queryTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import { loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { isFeedAdCommunityTopicTargetAllowed } from "@/lib/ads/feed-ad-placement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feed-ads/targets
 * Trade category + Community topic SSOT for Admin Feed Ad targeting.
 * No hardcoded copy lists / no raw-id primary UX.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      tradeCategories: [],
      communityTopics: [],
      meta: { source: "unavailable" },
    });
  }

  const [tradeRes, topics] = await Promise.all([
    queryTradeHomeRootCategories(sb),
    loadPhilifeDefaultSectionTopics().catch(() => [] as CommunityTopicDTO[]),
  ]);

  const tradeCategories = tradeRes.ok
    ? tradeRes.categories.map((c) => ({
        id: c.id,
        name: c.name,
        nameEn: c.name_en ?? null,
        slug: c.slug,
      }))
    : [];

  const communityTopics = (topics ?? [])
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      nameEn: t.name_en ?? null,
    }))
    .filter((t) => isFeedAdCommunityTopicTargetAllowed(String(t.slug ?? "")));

  return NextResponse.json({
    ok: true,
    tradeCategories,
    communityTopics,
    meta: {
      tradeSource: "categories.show_in_home_chips",
      communitySource: "community_topics",
    },
  });
}
