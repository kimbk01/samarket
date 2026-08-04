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

export type MypageHomeProfileResolveOk = {
  ok: true;
  profile: ProfileRow;
};

/**
 * `session_broken` — API non-OK while cookies/local user may still exist
 * (e.g. Invalid UTF-8 chunked auth cookies → 500). UI must offer re-login,
 * not endless 「확인 중」.
 */
export type MypageHomeProfileResolveFail = {
  ok: false;
  kind: "unauthenticated" | "session_broken" | "empty";
  status: number;
};

export type MypageHomeProfileResolveResult =
  | MypageHomeProfileResolveOk
  | MypageHomeProfileResolveFail;

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

function okResult(profile: ProfileRow | null): MypageHomeProfileResolveResult {
  const id = profile?.id?.trim();
  if (!id || !profile) {
    return { ok: false, kind: "empty", status: 0 };
  }
  return { ok: true, profile };
}

/**
 * Resolve profile for `/mypage` root with failure classification.
 * Network at most once via `fetchMeProfileDeduped` when no fresh snapshot.
 */
export async function resolveMypageHomeProfileResult(): Promise<MypageHomeProfileResolveResult> {
  const peek = peekMypageHomeProfileRow();
  if (peek?.id?.trim()) return { ok: true, profile: peek };
  if (isMeProfileFullFetchSkippable()) {
    return okResult(profileFromDedupedCache());
  }
  const { status, json: raw } = await fetchMeProfileDeduped("mypage_home_model");
  if (status === 401 || status === 403) {
    return { ok: false, kind: "unauthenticated", status };
  }
  const json = raw as { ok?: boolean; profile?: ProfileRow | null } | null;
  if (status >= 200 && status < 300 && json?.ok && json.profile != null) {
    return { ok: true, profile: json.profile };
  }
  // 5xx / 0 / malformed / missing profile — treat as session/cookie hard fail for recovery UX
  if (status === 0 || status >= 500 || (status >= 200 && status < 300 && !json?.profile)) {
    const fallback = peekMypageHomeProfileRow();
    if (fallback?.id?.trim()) return { ok: true, profile: fallback };
    return {
      ok: false,
      kind: status === 0 || status >= 500 ? "session_broken" : "empty",
      status,
    };
  }
  if (status >= 400) {
    return { ok: false, kind: "session_broken", status };
  }
  return okResult(peekMypageHomeProfileRow());
}

/**
 * Resolve profile for `/mypage` root.
 * Network at most once via `fetchMeProfileDeduped` when no fresh snapshot.
 */
export async function resolveMypageHomeProfileRow(): Promise<ProfileRow | null> {
  const result = await resolveMypageHomeProfileResult();
  return result.ok ? result.profile : null;
}
