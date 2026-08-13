/**
 * Community post notification destination SSOT.
 *
 * Canonical in-app + share detail for community posts is `/community/posts/:id`
 * (`app/(main)/community/posts/[postId]/page.tsx`).
 *
 * DO NOT invent `/philife/posts/:id` — that route does not exist (404).
 * `/philife/:id` is neighborhood Detail and may notFound without location_id.
 */

import { buildCommunityPostSharePath } from "@/lib/community/share/community-share-url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Canonical notification / push / deep-link destination for a community post. */
export function buildCommunityPostNotificationPath(postId: string): string {
  return buildCommunityPostSharePath(postId);
}

/**
 * Read-time heal for poisoned legacy writers that stored `/philife/posts/:uuid`.
 * Only rewrites when the id segment is a UUID — never blanket string replace.
 */
export function canonicalizeLegacyCommunityPostNotificationPath(
  pathname: string
): string | null {
  const path = pathname.trim().split("?")[0] ?? "";
  const match = /^\/philife\/posts\/([^/]+)$/i.exec(path);
  if (!match?.[1]) return null;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  if (!UUID_RE.test(id)) return null;
  return buildCommunityPostNotificationPath(id);
}
