import {
  invalidateBootstrapLiteSocialDeferred,
  storeBootstrapLiteSocialDeferred,
} from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";

function dedupeUserIds(userIds: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of userIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** accept 직후 — home/bootstrap snapshot·lite social deferred 를 SSOT friendships 로 맞춘다 */
export async function primeMessengerFriendshipSocialGraphAfterAccept(
  userIds: readonly string[]
): Promise<void> {
  const ids = dedupeUserIds(userIds);
  if (!ids.length) return;

  for (const id of ids) {
    invalidateHomeSyncSnapshotCache(id);
    invalidateCmBootstrapSnapshotCache(id);
    invalidateFullBootstrapSnapshotCache(id, "friend_accept");
    invalidateBootstrapLiteSocialDeferred(id);
  }

  const { fetchBootstrapLiteSocialGraphSnapshot } = await import("@/lib/community-messenger/service");
  await Promise.all(
    ids.map(async (id) => {
      const snapshot = await fetchBootstrapLiteSocialGraphSnapshot(id);
      storeBootstrapLiteSocialDeferred(id, snapshot);
    })
  );
}
