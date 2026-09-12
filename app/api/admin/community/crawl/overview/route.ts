import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  listCommunityCrawlBoards,
  listCommunityCrawlRuns,
  listCommunityCrawlSources,
} from "@/lib/community-crawler/admin-crawl-store";
import { listAuthorPools } from "@/lib/community-crawler/author-pool-store";
import {
  COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
  COMMUNITY_CRAWL_SCHEDULER_FROZEN,
  COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
  COMMUNITY_CRAWL_TEST_AVAILABLE,
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
} from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const [sources, boards, runs, authorPools] = await Promise.all([
      listCommunityCrawlSources(sb),
      listCommunityCrawlBoards(sb),
      listCommunityCrawlRuns(sb, { limit: 40 }),
      listAuthorPools(sb).catch(() => []),
    ]);

    const topicIds = Array.from(new Set(boards.map((b) => b.dibay_topic_id).filter(Boolean)));
    let topics: Array<{ id: string; name: string; slug: string }> = [];
    if (topicIds.length) {
      const { data, error } = await sb.from("community_topics").select("id, name, slug").in("id", topicIds);
      if (error) throw new Error(error.message);
      topics = (data ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        name: String((r as { name?: string }).name ?? ""),
        slug: String((r as { slug?: string }).slug ?? ""),
      }));
    } else {
      const { data, error } = await sb
        .from("community_topics")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (!error && Array.isArray(data)) {
        topics = data.map((r) => ({
          id: String((r as { id: string }).id),
          name: String((r as { name?: string }).name ?? ""),
          slug: String((r as { slug?: string }).slug ?? ""),
        }));
      }
    }

    // Always expose active content topics for board create select.
    if (topicIds.length) {
      const { data } = await sb
        .from("community_topics")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (Array.isArray(data)) {
        const byId = new Map(topics.map((t) => [t.id, t]));
        for (const r of data) {
          const id = String((r as { id: string }).id);
          if (!byId.has(id)) {
            byId.set(id, {
              id,
              name: String((r as { name?: string }).name ?? ""),
              slug: String((r as { slug?: string }).slug ?? ""),
            });
          }
        }
        topics = Array.from(byId.values());
      }
    }

    const activeBoards = boards.filter((b) => b.enabled && b.schedule_enabled).length;
    const errorBoards = boards.filter((b) => Boolean(b.last_error)).length;
    const lastCrawlAt =
      boards
        .map((b) => b.last_run_at)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null;

    return NextResponse.json({
      ok: true,
      sources,
      boards,
      runs,
      topics,
      authorPools,
      summary: {
        activeBoards,
        errorBoards,
        lastCrawlAt,
        totalSources: sources.length,
        totalBoards: boards.length,
      },
      crawlCoreAvailable: false,
      crawlCoreUnavailableReason: COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
      testCrawlAvailable: COMMUNITY_CRAWL_TEST_AVAILABLE,
      manualCrawlAvailable: false,
      schedulerFrozen: COMMUNITY_CRAWL_SCHEDULER_FROZEN,
      schedulerFreezeState: COMMUNITY_CRAWL_SCHEDULER_FREEZE_STATE,
      v2PublishTarget: COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isMissingRelationError(message)) {
      return NextResponse.json(
        {
          ok: false,
          error: "crawl_registry_not_applied",
          message,
          crawlCoreAvailable: false,
          crawlCoreUnavailableReason: COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
          testCrawlAvailable: false,
          manualCrawlAvailable: false,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
