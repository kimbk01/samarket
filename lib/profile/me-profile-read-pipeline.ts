import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import {
  createEnsureUserProfileMetrics,
  ensureUserProfile,
  type EnsureUserProfileMetrics,
} from "@/lib/auth/ensure-user-profile";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { fetchProfileRowSafe, type ProfileFetchMetrics } from "@/lib/profile/fetch-profile-row-safe";
import type { ProfileRow } from "@/lib/profile/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

/** `runMeProfileReadPipeline` 단계별 벽시계(ms) — `[dev-api-perf]` 합산용 + `ensureUserProfile` 세부 */
export type MeProfilePipelinePerf = EnsureUserProfileMetrics & {
  pipeline_total_ms: number;
  ensure_user_profile_ms: number;
  profile_row_fetch_ms: number;
  profile_row_normalize_ms: number;
  profile_row_fallback_ms: number;
  profile_quota_ms: number;
  profile_session_sync_ms: number;
  profile_payload_build_ms: number;
  profile_extra_store_badge_ms: number;
  profile_extra_settings_ms: number;
  profile_rls_or_postgrest_wait_ms: number;
};

export function createEmptyMeProfilePipelinePerf(): MeProfilePipelinePerf {
  return {
    ...createEnsureUserProfileMetrics(),
    pipeline_total_ms: 0,
    ensure_user_profile_ms: 0,
    profile_row_fetch_ms: 0,
    profile_row_normalize_ms: 0,
    profile_row_fallback_ms: 0,
    profile_quota_ms: 0,
    profile_session_sync_ms: 0,
    profile_payload_build_ms: 0,
    profile_extra_store_badge_ms: 0,
    profile_extra_settings_ms: 0,
    profile_rls_or_postgrest_wait_ms: 0,
  };
}

/**
 * 내 프로필 조회 단일 서버 파이프라인.
 *
 * - `serviceSb` 가 있으면 **선 fetch** 후 `ensureUserProfile` 에 읽은 행을 넘겨
 *   정상 기존 사용자는 `ensureAuthProfileRow` heavy 경로를 생략한다.
 * - `serviceSb` 가 없으면(RLS-only) 기존처럼 **ensure 선행** 후 fetch 한다.
 */
export async function runMeProfileReadPipeline(args: {
  authUserId: string;
  /** `getUser()` 로 검증된 사용자. 없으면(테스트 쿠키 등) SNS 식별 단계만 생략한다. */
  supabaseUser: User | null;
  routeSb: SupabaseClient;
  serviceSb: SupabaseClient | null;
  /** GET /api/me/profile 계측 — `fetchProfileRowSafe` PostgREST 왕복만 집계 */
  profileFetchMetrics?: ProfileFetchMetrics;
  /** `lite=1` 시 첫 select 컬럼 축소(폴백 시 full 체인) */
  profileSelectMode?: "full" | "lite";
  /** 단계별 ms 누적 — `pipeline_total_ms` 는 종료 시 덮어씀 */
  pipelineStepMs?: MeProfilePipelinePerf;
}): Promise<ProfileRow | null> {
  const {
    authUserId,
    supabaseUser,
    routeSb,
    serviceSb,
    profileFetchMetrics: m,
    profileSelectMode = "full",
    pipelineStepMs: perf,
  } = args;
  const writeSb = serviceSb ?? routeSb;
  const tPipeline0 = devPerfNow();
  const selectMode = profileSelectMode;

  const finalizePerf = (profile: ProfileRow | null) => {
    if (!perf) return;
    perf.pipeline_total_ms = devPerfNow() - tPipeline0;
    if (m) {
      perf.profile_row_fetch_ms = m.profile_row_fetch_wall_ms;
      perf.profile_row_normalize_ms = m.profile_row_merge_optional_wall_ms;
      perf.profile_rls_or_postgrest_wait_ms = m.profile_row_fetch_wall_ms;
    }
    void profile;
  };

  if (serviceSb) {
    let profile = await fetchProfileRowSafe(serviceSb, authUserId, m, selectMode);
    if (supabaseUser) {
      const ensureM = createEnsureUserProfileMetrics();
      const t0 = devPerfNow();
      try {
        const outcome = await ensureUserProfile(writeSb, supabaseUser, {
          metrics: ensureM,
          existingProfileRow: profile,
        });
        if (outcome.duplicateWarning && process.env.NODE_ENV !== "production") {
          console.warn("[me-profile-read-pipeline] duplicate profile candidate", {
            userId: supabaseUser.id,
            candidates: outcome.duplicateCandidates,
          });
        }
      } catch {
        /* ensureUserProfile 실패는 아래 ensureProfileForUserId 가 보강 */
      } finally {
        if (perf) {
          perf.ensure_user_profile_ms += devPerfNow() - t0;
          Object.assign(perf, ensureM);
        }
      }
    }
    if (!profile) {
      profile = await fetchProfileRowSafe(serviceSb, authUserId, m, selectMode);
    }
    if (!profile) {
      const tfb = devPerfNow();
      profile = await ensureProfileForUserId(serviceSb, authUserId);
      if (perf) perf.profile_row_fallback_ms += devPerfNow() - tfb;
    }
    if (!profile) {
      profile = await fetchProfileRowSafe(serviceSb, authUserId, m, selectMode);
    }
    finalizePerf(profile);
    return profile;
  }

  if (supabaseUser) {
    const ensureM = createEnsureUserProfileMetrics();
    const t0 = devPerfNow();
    try {
      const outcome = await ensureUserProfile(writeSb, supabaseUser, { metrics: ensureM });
      if (outcome.duplicateWarning && process.env.NODE_ENV !== "production") {
        console.warn("[me-profile-read-pipeline] duplicate profile candidate", {
          userId: supabaseUser.id,
          candidates: outcome.duplicateCandidates,
        });
      }
    } catch {
      /* ensureUserProfile 실패는 아래 ensureAuthProfileRow·ensureProfileForUserId 가 보강 */
    } finally {
      if (perf) {
        perf.ensure_user_profile_ms += devPerfNow() - t0;
        Object.assign(perf, ensureM);
      }
    }
  }

  let profile = await fetchProfileRowSafe(routeSb, authUserId, m, selectMode);
  if (!profile) {
    const svc = tryCreateSupabaseServiceClient();
    if (svc) {
      if (supabaseUser) {
        try {
          const tfb = devPerfNow();
          await ensureAuthProfileRow(svc, supabaseUser);
          if (perf) perf.profile_row_fallback_ms += devPerfNow() - tfb;
        } catch {
          const tfb = devPerfNow();
          await ensureProfileForUserId(svc, authUserId);
          if (perf) perf.profile_row_fallback_ms += devPerfNow() - tfb;
        }
      } else {
        const tfb = devPerfNow();
        await ensureProfileForUserId(svc, authUserId);
        if (perf) perf.profile_row_fallback_ms += devPerfNow() - tfb;
      }
      profile = await fetchProfileRowSafe(routeSb, authUserId, m, selectMode);
      if (!profile) profile = await fetchProfileRowSafe(svc, authUserId, m, selectMode);
    } else if (supabaseUser) {
      try {
        const tfb = devPerfNow();
        await ensureAuthProfileRow(routeSb, supabaseUser);
        if (perf) perf.profile_row_fallback_ms += devPerfNow() - tfb;
      } catch {
        /* INSERT-only 도 막혔다면 다음 GET 에서 다시 시도 */
      }
      profile = await fetchProfileRowSafe(routeSb, authUserId, m, selectMode);
    }
  }
  finalizePerf(profile);
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
