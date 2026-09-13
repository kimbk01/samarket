/**
 * Community Public publication chronology helpers.
 * created_at = DB audit; published_at = Public Feed/Detail/age.
 */

export type CommunityFeedKeysetCursor = {
  publishedAt: string;
  id: string;
};

/** Public display clock — prefer published_at, fall back to created_at during rollout. */
export function communityPostPublicPublishedAt(row: {
  published_at?: string | null;
  created_at?: string | null;
}): string {
  const p = row.published_at != null ? String(row.published_at).trim() : "";
  if (p) return p;
  return row.created_at != null ? String(row.created_at) : "";
}

/**
 * PostgREST filter: (published_at, id) < (cursor) for DESC keyset pages.
 */
export function communityFeedKeysetOrFilter(cursor: CommunityFeedKeysetCursor): string {
  const ts = cursor.publishedAt.trim().replace(/"/g, "");
  const id = cursor.id.trim().replace(/"/g, "");
  return `published_at.lt."${ts}",and(published_at.eq."${ts}",id.lt."${id}")`;
}

export function encodeCommunityFeedCursor(cursor: CommunityFeedKeysetCursor): string {
  return `${cursor.publishedAt}\u001f${cursor.id}`;
}

export function decodeCommunityFeedCursor(raw: string | null | undefined): CommunityFeedKeysetCursor | null {
  const s = raw?.trim() ?? "";
  if (!s) return null;
  const i = s.indexOf("\u001f");
  if (i <= 0) return null;
  const publishedAt = s.slice(0, i).trim();
  const id = s.slice(i + 1).trim();
  if (!publishedAt || !id) return null;
  return { publishedAt, id };
}
