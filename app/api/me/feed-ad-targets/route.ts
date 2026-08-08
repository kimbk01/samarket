import { NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { queryTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import { loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same SSOT as admin targets — member banner request selectors. */
export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, tradeCategories: [], communityTopics: [] });
  }

  const [tradeRes, topics] = await Promise.all([
    queryTradeHomeRootCategories(sb),
    loadPhilifeDefaultSectionTopics().catch(() => [] as CommunityTopicDTO[]),
  ]);

  return NextResponse.json({
    ok: true,
    tradeCategories: tradeRes.ok
      ? tradeRes.categories.map((c) => ({
          id: c.id,
          name: c.name,
          nameEn: c.name_en ?? null,
          slug: c.slug,
        }))
      : [],
    communityTopics: (topics ?? [])
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        nameEn: t.name_en ?? null,
      }))
      .filter((t) => Boolean(t.slug)),
  });
}
