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
 * `unauthenticated` — 401/403 만 (실제 인증 실패 → 재로그인 UX).
 * `fetch_failed` — 5xx / 네트워크(0) / 기타 4xx. 일시 장애이므로 로그아웃 유도 금지 — 재시도 UX.
 * `empty` — 2xx 인데 프로필 없음.
 */
export type MypageHomeProfileResolveFail = {
  ok: false;
  kind: "unauthenticated" | "fetch_failed" | "empty";
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
  // 5xx / 0 / malformed / missing profile — 일시 장애: 캐시 우선, 없으면 재시도 대상
  if (status === 0 || status >= 500 || (status >= 200 && status < 300 && !json?.profile)) {
    const fallback = peekMypageHomeProfileRow();
    if (fallback?.id?.trim()) return { ok: true, profile: fallback };
    return {
      ok: false,
      kind: status === 0 || status >= 500 ? "fetch_failed" : "empty",
      status,
    };
  }
  if (status >= 400) {
    return { ok: false, kind: "fetch_failed", status };
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
