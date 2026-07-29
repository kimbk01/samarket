/**
 * `/mypage` root profile read — single authority over network.
 * Prefer app-boot / deduped cache; only then `fetchMeProfileDeduped` (full).
 * DO NOT: call lite=1 from mypage; DO NOT parallel lite+full.
 */
import { peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import {
  fetchMeProfileDeduped,
  isMeProfileFullFetchSkippable,
  peekMeProfileCached,
} from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";

function profileFromDedupedCache(): ProfileRow | null {
  const cached = peekMeProfileCached();
  if (!cached || cached.status !== 200) return null;
  const json = cached.json as { ok?: boolean; profile?: ProfileRow | null } | null;
  if (!json?.ok || json.profile == null) return null;
  const id = json.profile.id?.trim();
  return id ? json.profile : null;
}

/** Sync snapshot for mypage home — no network. */
export function peekMypageHomeProfileRow(): ProfileRow | null {
  return profileFromDedupedCache() ?? peekAppBootProfile();
}

/**
 * Resolve profile for `/mypage` root.
 * Network at most once via `fetchMeProfileDeduped` when no fresh snapshot.
 */
export async function resolveMypageHomeProfileRow(): Promise<ProfileRow | null> {
  const peek = peekMypageHomeProfileRow();
  if (peek?.id?.trim()) return peek;
  if (isMeProfileFullFetchSkippable()) {
    return profileFromDedupedCache();
  }
  const { status, json: raw } = await fetchMeProfileDeduped("mypage_home_model");
  if (status === 401 || status === 403) return null;
  const json = raw as { ok?: boolean; profile?: ProfileRow | null } | null;
  if (status >= 200 && status < 300 && json?.ok && json.profile != null) {
    return json.profile;
  }
  return peekMypageHomeProfileRow();
}
