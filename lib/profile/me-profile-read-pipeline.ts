import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { ensureUserProfile } from "@/lib/auth/ensure-user-profile";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import type { ProfileRow } from "@/lib/profile/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * 내 프로필 조회 단일 서버 파이프라인.
 *
 * - 예전 `POST /api/auth/profile/ensure` 전용이던 `ensureUserProfile`(SNS 식별)을
 *   **GET /api/me/profile** 과 POST ensure **양쪽**에서 동일 순서로 실행한다.
 * - 클라이언트는 세션 하이드레이션에 POST ensure 를 쓰지 않고 GET 만 쓰면 된다.
 */
export async function runMeProfileReadPipeline(args: {
  authUserId: string;
  /** `getUser()` 로 검증된 사용자. 없으면(테스트 쿠키 등) SNS 식별 단계만 생략한다. */
  supabaseUser: User | null;
  routeSb: SupabaseClient;
  serviceSb: SupabaseClient | null;
}): Promise<ProfileRow | null> {
  const { authUserId, supabaseUser, routeSb, serviceSb } = args;
  const writeSb = serviceSb ?? routeSb;

  if (supabaseUser) {
    try {
      const outcome = await ensureUserProfile(writeSb, supabaseUser);
      if (outcome.duplicateWarning && process.env.NODE_ENV !== "production") {
        console.warn("[me-profile-read-pipeline] duplicate profile candidate", {
          userId: supabaseUser.id,
          candidates: outcome.duplicateCandidates,
        });
      }
    } catch {
      /* ensureUserProfile 실패는 아래 ensureAuthProfileRow·ensureProfileForUserId 가 보강 */
    }
  }

  if (serviceSb) {
    let profile = await fetchProfileRowSafe(serviceSb, authUserId);
    if (!profile) {
      profile = await ensureProfileForUserId(serviceSb, authUserId);
    }
    return profile;
  }

  let profile = await fetchProfileRowSafe(routeSb, authUserId);
  if (!profile) {
    const svc = tryCreateSupabaseServiceClient();
    if (svc) {
      if (supabaseUser) {
        try {
          await ensureAuthProfileRow(svc, supabaseUser);
        } catch {
          await ensureProfileForUserId(svc, authUserId);
        }
      } else {
        await ensureProfileForUserId(svc, authUserId);
      }
      profile = await fetchProfileRowSafe(routeSb, authUserId);
      if (!profile) profile = await fetchProfileRowSafe(svc, authUserId);
    } else if (supabaseUser) {
      try {
        await ensureAuthProfileRow(routeSb, supabaseUser);
      } catch {
        /* INSERT-only 도 막혔다면 다음 GET 에서 다시 시도 */
      }
      profile = await fetchProfileRowSafe(routeSb, authUserId);
    }
  }
  return profile;
}

/** POST /api/auth/profile/ensure 과 동일 형태의 `profile` 객체 (하위 호환). */
export function profileRowToEnsureApiPayload(row: ProfileRow) {
  const temp = row.trust_score ?? row.manner_score ?? 50;
  return {
    id: row.id,
    email: row.email ?? "",
    display_name: row.nickname ?? row.display_name ?? "user",
    nickname: row.nickname ?? "user",
    avatar_url: withDefaultAvatar(row.avatar_url),
    username: row.username,
    role: row.role,
    status: row.status,
    member_type: row.member_type,
    phone: row.phone,
    phone_country_code: row.phone_country_code ?? "+63",
    phone_number: row.phone_number ?? null,
    phone_verified: row.phone_verified === true,
    phone_verified_at: row.phone_verified_at ?? null,
    phone_verification_status: row.phone_verification_status,
    provider: row.provider ?? row.auth_provider ?? null,
    auth_provider: row.auth_provider,
    temperature: typeof temp === "number" && Number.isFinite(temp) ? temp : 50,
    terms_accepted_at: row.terms_accepted_at ?? null,
    terms_version: row.terms_version ?? null,
    privacy_accepted_at: row.privacy_accepted_at ?? null,
    privacy_version: row.privacy_version ?? null,
  };
}
