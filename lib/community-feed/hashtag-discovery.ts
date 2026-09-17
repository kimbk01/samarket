import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";

/** Normalize URL/query hashtag token (strip #, trim, lower, max 32). */
export function normalizeCommunityHashtagQuery(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/^#+/, "")
    .slice(0, 32);
  if (!s) return "";
  // Keep letters/numbers/_/- only (matches extractHashtagPreview capture)
  if (!/^[\p{L}\p{N}_-]+$/u.test(s)) return "";
  return s.toLowerCase();
}

/** Escape `%` `_` `\` for PostgREST ilike patterns. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Exact hashtag token match in title/body/summary (same tokenizer as feed preview).
 * Does not match `#food` inside `#foodie`.
 */
export function communityPostTextMatchesHashtag(
  parts: { title?: string | null; content?: string | null; summary?: string | null },
  tagNormalized: string
): boolean {
  const tag = normalizeCommunityHashtagQuery(tagNormalized);
  if (!tag) return false;
  const text = `${parts.title ?? ""}\n${parts.content ?? ""}\n${parts.summary ?? ""}`;
  const tokens = extractHashtagPreview(text, 64);
  return tokens.some((t) => normalizeCommunityHashtagQuery(t) === tag);
}

/** PostgREST `.or()` filter — coarse prefilter; always pair with exact match. */
export function communityHashtagIlikeOrFilter(tagNormalized: string): string {
  const tag = normalizeCommunityHashtagQuery(tagNormalized);
  const esc = escapeIlikePattern(tag);
  const needle = `%#${esc}%`;
  return `title.ilike.${needle},content.ilike.${needle},summary.ilike.${needle}`;
}

/** Global Search community keyword — not hashtag tokenization. */
export function sanitizeCommunityKeywordQuery(raw: string | null | undefined): string {
  const t = (raw ?? "")
    .trim()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.slice(0, 60);
}

export function communityKeywordIlikeOrFilter(raw: string): string {
  const keyword = sanitizeCommunityKeywordQuery(raw);
  if (!keyword) return "";
  const needle = `%${escapeIlikePattern(keyword)}%`;
  return `title.ilike.${needle},content.ilike.${needle},summary.ilike.${needle}`;
}

export function communityPostTextMatchesKeyword(
  parts: { title?: string | null; content?: string | null; summary?: string | null },
  raw: string
): boolean {
  const keyword = sanitizeCommunityKeywordQuery(raw).toLowerCase();
  if (!keyword) return false;
  const hay = `${parts.title ?? ""}\n${parts.content ?? ""}\n${parts.summary ?? ""}`.toLowerCase();
  return hay.includes(keyword);
}
