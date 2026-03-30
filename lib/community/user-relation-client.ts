import { runSingleFlight } from "@/lib/http/run-single-flight";

type CommunityUserRelationSnapshot = {
  following: boolean | null;
  blocked: boolean | null;
};

const MIN_FETCH_GAP_MS = 5_000;
const relationCache = new Map<string, { at: number; value: CommunityUserRelationSnapshot }>();

function relationKey(targetUserId: string) {
  return `community-user-relation:${targetUserId.trim()}`;
}

export function invalidateCommunityUserRelationSnapshot(targetUserId: string): void {
  relationCache.delete(relationKey(targetUserId));
}

export async function fetchCommunityUserRelationSnapshot(
  targetUserId: string
): Promise<CommunityUserRelationSnapshot> {
  const key = relationKey(targetUserId);
  const cached = relationCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < MIN_FETCH_GAP_MS) {
    return cached.value;
  }

  return runSingleFlight(key, async () => {
    try {
      const [resFollow, resBlock] = await Promise.all([
        fetch(`/api/community/neighbor-relations?targetUserId=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/community/block-relations?targetUserId=${encodeURIComponent(targetUserId)}`, {
          cache: "no-store",
        }),
      ]);

      const jf = (await resFollow.json().catch(() => ({}))) as {
        ok?: boolean;
        following?: boolean;
      };
      const jb = (await resBlock.json().catch(() => ({}))) as {
        ok?: boolean;
        blocked?: boolean;
      };

      const next = {
        following:
          resFollow.ok && jf.ok && typeof jf.following === "boolean" ? jf.following : null,
        blocked:
          resBlock.ok && jb.ok && typeof jb.blocked === "boolean" ? jb.blocked : null,
      };
      relationCache.set(key, { at: Date.now(), value: next });
      return next;
    } catch {
      return { following: null, blocked: null };
    }
  });
}
