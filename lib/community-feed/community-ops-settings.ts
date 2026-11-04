import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { normalizeOperatorBannedWords } from "@/lib/community-feed/banned-word-match";

/** `admin_settings.key` — 동네생활 피드 운영(금칙어·길이·도배) */
export const COMMUNITY_FEED_OPS_KEY = "community_feed_ops";

export type CommunityFeedOps = {
  banned_words: string[];
  max_title_length: number;
  max_content_length: number;
  max_comment_length: number;
  /** 0이면 제한 없음 */
  max_posts_per_day: number;
  /** 0이면 제한 없음 — 동일 유저 댓글 최소 간격(초) */
  min_comment_interval_sec: number;
};

const DEFAULT_OPS: CommunityFeedOps = {
  banned_words: [],
  max_title_length: 200,
  max_content_length: 20000,
  max_comment_length: 4000,
  max_posts_per_day: 50,
  min_comment_interval_sec: 0,
};

function normalizeWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return normalizeOperatorBannedWords(raw);
}

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function mergeCommunityFeedOps(partial: Record<string, unknown> | null | undefined): CommunityFeedOps {
  const p = partial ?? {};
  return {
    banned_words: normalizeWords(p.banned_words),
    max_title_length: clampInt(p.max_title_length, DEFAULT_OPS.max_title_length, 1, 500),
    max_content_length: clampInt(p.max_content_length, DEFAULT_OPS.max_content_length, 100, 100000),
    max_comment_length: clampInt(p.max_comment_length, DEFAULT_OPS.max_comment_length, 50, 20000),
    max_posts_per_day: clampInt(p.max_posts_per_day, DEFAULT_OPS.max_posts_per_day, 0, 500),
    min_comment_interval_sec: clampInt(p.min_comment_interval_sec, DEFAULT_OPS.min_comment_interval_sec, 0, 86400),
  };
}

const BANNED_WORDS_CACHE_MS = 60_000;
let bannedWordsCache: { at: number; words: string[] } | null = null;

/** 채팅 송신처럼 잦은 경로용 — 운영 목록을 인스턴스당 60초 캐시(관리자 수정은 최대 60초 뒤 반영). */
export async function getCommunityBannedWordsCached(): Promise<string[]> {
  const now = Date.now();
  if (bannedWordsCache && now - bannedWordsCache.at < BANNED_WORDS_CACHE_MS) return bannedWordsCache.words;
  const words = (await getCommunityFeedOps()).banned_words;
  bannedWordsCache = { at: now, words };
  return words;
}

export async function getCommunityFeedOps(): Promise<CommunityFeedOps> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", COMMUNITY_FEED_OPS_KEY)
      .maybeSingle();
    if (error || !data) return mergeCommunityFeedOps({});
    const v = (data as { value_json?: Record<string, unknown> }).value_json;
    return mergeCommunityFeedOps(v ?? {});
  } catch {
    return mergeCommunityFeedOps({});
  }
}


export async function countUserCommunityPostsToday(userId: string): Promise<number> {
  try {
    const sb = getSupabaseServer();
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count, error } = await sb
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", start.toISOString());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getLatestCommentTimeForUser(userId: string): Promise<string | null> {
  try {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from("community_comments")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { created_at?: string } | null)?.created_at ?? null;
  } catch {
    return null;
  }
}
