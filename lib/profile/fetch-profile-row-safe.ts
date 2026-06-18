import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "./types";
import { DEFAULT_PROFILE_ROW } from "./types";
import { hydrateProfileRowPhone } from "@/lib/profile/resolve-profile-phone";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

/** `GET /api/me/profile` 등 — `fetchProfileRowSafe` 호출·merge·폴백 계측 */
export type ProfileFetchMetrics = {
  profileQueryCallCount: number;
  profileSelectColumns: string;
  profile_row_fetch_wall_ms: number;
  profile_row_merge_optional_wall_ms: number;
  profile_fetch_attempt_count: number;
  /** 첫 select 성공 전에 실패한 리스트 수(0 = 첫 시도 성공) */
  profile_fetch_fallback_count: number;
  /** 스키마/컬럼 오류로 다음 리스트로 넘긴 횟수 */
  profile_fetch_schema_retry_count: number;
  profile_fetch_mode: "full" | "lite" | "";
  profile_fetch_total_ms: number;
  /** 첫 성공 select 완료까지(ms). 실패 시 0 */
  profile_fetch_first_success_ms: number;
  /** 마지막 select 시도 1회 벽시계(ms) */
  profile_fetch_last_attempt_ms: number;
  /** 마지막 스키마 폴백 계열 오류 메시지 앞부분 */
  profile_fetch_last_schema_error_snippet: string;
};

export function createEmptyProfileFetchMetrics(): ProfileFetchMetrics {
  return {
    profileQueryCallCount: 0,
    profileSelectColumns: "",
    profile_row_fetch_wall_ms: 0,
    profile_row_merge_optional_wall_ms: 0,
    profile_fetch_attempt_count: 0,
    profile_fetch_fallback_count: 0,
    profile_fetch_schema_retry_count: 0,
    profile_fetch_mode: "",
    profile_fetch_total_ms: 0,
    profile_fetch_first_success_ms: 0,
    profile_fetch_last_attempt_ms: 0,
    profile_fetch_last_schema_error_snippet: "",
  };
}

/**
 * PostgREST/DB 스키마가 마이그레이션보다 앞서거나 뒤처진 경우 `select("*")`·과도한 컬럼 목록이 500을 유발할 수 있음.
 * 내정보·ensureProfile 등은 단계적 select 로 행을 읽는다.
 */
const SELECT_FULL = [
  "id",
  "email",
  "display_name",
  "nickname",
  "avatar_url",
  "profile_completed",
  "bio",
  "region_code",
  "region_name",
  "address_street_line",
  "address_detail",
  "latitude",
  "longitude",
  "full_address",
  "phone",
  "phone_country_code",
  "phone_number",
  "phone_verified",
  "phone_verification_status",
  "phone_verified_at",
  "auth_login_email",
  "realname",
  "realname_verified",
  "status",
  "member_status",
  "role",
  "is_admin",
  "member_type",
  "is_special_member",
  "points",
  "manner_score",
  "trust_score",
  "preferred_language",
  "preferred_country",
  "provider",
  "provider_user_id",
  "active_session_id",
  "last_login_at",
  "last_device_info",
  "created_by_admin",
  "terms_accepted_at",
  "terms_version",
  "privacy_accepted_at",
  "privacy_version",
  "deleted_at",
  "deletion_requested_at",
  "manual_account_type",
  "notify_commerce_email",
  "created_at",
  "updated_at",
  "username",
  "dibay_id",
  "dibay_id_locked",
  "username_confirmed",
  "onboarding_status",
  "onboarding_completed_at",
  "auth_provider",
].join(", ");

const SELECT_MID = [
  "id",
  "email",
  "display_name",
  "username",
  "dibay_id",
  "dibay_id_locked",
  "username_confirmed",
  "onboarding_status",
  "onboarding_completed_at",
  "nickname",
  "avatar_url",
  "profile_completed",
  "bio",
  "region_code",
  "region_name",
  "phone",
  "phone_country_code",
  "phone_number",
  "phone_verified",
  "phone_verification_status",
  "phone_verified_at",
  "auth_login_email",
  "realname",
  "realname_verified",
  "status",
  "member_status",
  "role",
  "is_admin",
  "member_type",
  "is_special_member",
  "points",
  "manner_score",
  "trust_score",
  "preferred_language",
  "preferred_country",
  "provider",
  "provider_user_id",
  "active_session_id",
  "last_login_at",
  "last_device_info",
  "created_by_admin",
  "terms_accepted_at",
  "terms_version",
  "privacy_accepted_at",
  "privacy_version",
  "deleted_at",
  "deletion_requested_at",
  "manual_account_type",
  "created_at",
  "updated_at",
  "auth_provider",
].join(", ");

const SELECT_MEMBER =
  "id, email, display_name, username, dibay_id, dibay_id_locked, username_confirmed, onboarding_status, onboarding_completed_at, nickname, avatar_url, profile_completed, role, is_admin, member_type, status, member_status, phone, phone_country_code, phone_number, phone_verified, phone_verification_status, phone_verified_at, auth_login_email, provider, provider_user_id, auth_provider, active_session_id, last_login_at, last_device_info, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, deleted_at, deletion_requested_at, manual_account_type";

/** username·auth_provider 가 아주 옛 스키마에 없을 때 */
const SELECT_LEGACY =
  "id, email, nickname, avatar_url, role, member_type, status, phone, phone_country_code, phone_number, phone_verified, phone_verification_status";

const SELECT_OPTIONAL =
  "address_street_line, address_detail, latitude, longitude, full_address, notify_commerce_email";

/** `GET /api/me/profile?lite=1` — 최소 컬럼(스키마 없으면 아래 폴백 체인으로 확장) */
const SELECT_ME_PROFILE_LITE = [
  "id",
  "email",
  "display_name",
  "nickname",
  "avatar_url",
  "profile_completed",
  "username",
  "dibay_id",
  "dibay_id_locked",
  "username_confirmed",
  "onboarding_status",
  "onboarding_completed_at",
  "role",
  "is_admin",
  "member_type",
  "is_special_member",
  "points",
  "manner_score",
  "trust_score",
  "region_name",
  "region_code",
  "phone",
  "phone_country_code",
  "phone_number",
  "phone_verified",
  "phone_verified_at",
  "phone_verification_status",
  "realname_verified",
  "status",
  "member_status",
  "preferred_language",
  "preferred_country",
  "created_at",
  "updated_at",
  "auth_provider",
  "provider",
  "provider_user_id",
  "active_session_id",
  "last_login_at",
  "last_device_info",
  "auth_login_email",
  "terms_accepted_at",
  "terms_version",
  "privacy_accepted_at",
  "privacy_version",
].join(", ");

export function isProfileSelectSchemaError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    /could not find .+ column/i.test(message)
  );
}

async function mergeOptionalFields(
  sb: SupabaseClient<any>,
  userId: string,
  base: Record<string, unknown>,
  metrics?: ProfileFetchMetrics
): Promise<Record<string, unknown>> {
  if (metrics) metrics.profileQueryCallCount += 1;
  const t0 = devPerfNow();
  const { data, error } = await sb.from("profiles").select(SELECT_OPTIONAL).eq("id", userId).maybeSingle();
  if (metrics) {
    metrics.profile_row_merge_optional_wall_ms += devPerfNow() - t0;
  }
  if (error || !data) return base;
  return { ...base, ...(data as Record<string, unknown>) };
}

function toProfileRow(userId: string, row: Record<string, unknown>): ProfileRow {
  const latRaw = row.latitude;
  const lngRaw = row.longitude;
  const lat =
    typeof latRaw === "number"
      ? latRaw
      : latRaw != null && String(latRaw).trim() !== ""
        ? Number(latRaw)
        : null;
  const lng =
    typeof lngRaw === "number"
      ? lngRaw
      : lngRaw != null && String(lngRaw).trim() !== ""
        ? Number(lngRaw)
        : null;
  const merged = {
    ...DEFAULT_PROFILE_ROW,
    ...row,
    latitude: lat != null && Number.isFinite(lat) ? lat : null,
    longitude: lng != null && Number.isFinite(lng) ? lng : null,
    id: userId,
    phone_verified: Boolean(row.phone_verified),
    realname_verified: Boolean(row.realname_verified),
    is_special_member: Boolean(row.is_special_member),
    points: Number(row.points ?? 0) || 0,
    manner_score: Number(row.manner_score ?? 50) || 50,
    trust_score: row.trust_score != null ? Number(row.trust_score) : 50,
  } as ProfileRow;
  return hydrateProfileRowPhone(merged);
}

async function selectProfileRaw(
  sb: SupabaseClient<any>,
  userId: string,
  selectList: string
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  const { data, error } = await sb.from("profiles").select(selectList).eq("id", userId).maybeSingle();
  return {
    data: (data as Record<string, unknown> | null) ?? null,
    error: error as { message?: string } | null,
  };
}

/**
 * `profiles` 단일 행을 스키마 변형에 견디게 읽어 ProfileRow 로 만든다.
 * - 행 없음: null
 * - 치명적 오류(네트워크 등): null
 */
export async function fetchProfileRowSafe(
  sb: SupabaseClient<any>,
  userId: string,
  metrics?: ProfileFetchMetrics,
  selectMode: "full" | "lite" = "full"
): Promise<ProfileRow | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const tAll0 = devPerfNow();
  if (metrics) {
    metrics.profile_fetch_mode = selectMode;
  }

  const tryLists =
    selectMode === "lite"
      ? [SELECT_ME_PROFILE_LITE, SELECT_FULL, SELECT_MID, SELECT_MEMBER, SELECT_LEGACY]
      : [SELECT_FULL, SELECT_MID, SELECT_MEMBER, SELECT_LEGACY];
  let row: Record<string, unknown> | null = null;
  let usedSelectList = "";
  let attemptIndex = 0;
  let firstSuccessRecorded = false;

  for (const list of tryLists) {
    if (metrics) metrics.profileQueryCallCount += 1;
    if (metrics) metrics.profile_fetch_attempt_count += 1;
    const t0 = devPerfNow();
    const { data, error } = await selectProfileRaw(sb, uid, list);
    const oneAttemptMs = devPerfNow() - t0;
    if (metrics) {
      metrics.profile_row_fetch_wall_ms += oneAttemptMs;
      metrics.profile_fetch_last_attempt_ms = Math.round(oneAttemptMs);
    }
    if (!error && data) {
      row = data;
      usedSelectList = list;
      if (metrics) {
        metrics.profileSelectColumns = list;
        if (!firstSuccessRecorded) {
          metrics.profile_fetch_first_success_ms = Math.round(devPerfNow() - tAll0);
          metrics.profile_fetch_fallback_count = Math.max(0, attemptIndex);
          firstSuccessRecorded = true;
        }
      }
      break;
    }
    if (error && isProfileSelectSchemaError(error.message)) {
      if (metrics) {
        metrics.profile_fetch_schema_retry_count += 1;
        const msg = String(error.message ?? "").slice(0, 220);
        metrics.profile_fetch_last_schema_error_snippet = msg;
      }
    }
    if (error && !isProfileSelectSchemaError(error.message)) {
      if (metrics) {
        metrics.profile_fetch_total_ms = Math.round(devPerfNow() - tAll0);
      }
      return null;
    }
    attemptIndex += 1;
  }

  if (metrics) {
    metrics.profile_fetch_total_ms = Math.round(devPerfNow() - tAll0);
  }

  if (!row) {
    if (metrics && !firstSuccessRecorded && metrics.profile_fetch_attempt_count > 0) {
      metrics.profile_fetch_fallback_count = Math.max(0, metrics.profile_fetch_attempt_count - 1);
    }
    return null;
  }

  // lite=1: SELECT_ME_PROFILE_LITE 성공 시 optional merge 생략 — 2번째 DB RTT 제거(부트 cold).
  // region_code/region_name 은 lite select에 포함. map-pin 전용(full_address+lat/lng)은
  // background full profile hydration 으로 보강(schedule-app-boot-background).
  const skipOptionalMergeForLite =
    selectMode === "lite" && usedSelectList === SELECT_ME_PROFILE_LITE;
  if (usedSelectList !== SELECT_FULL && !skipOptionalMergeForLite) {
    row = await mergeOptionalFields(sb, uid, row, metrics);
    if (metrics) {
      metrics.profileSelectColumns =
        metrics.profileSelectColumns && !metrics.profileSelectColumns.includes("+optional_merge")
          ? `${metrics.profileSelectColumns}+optional_merge`
          : metrics.profileSelectColumns;
    }
  }
  if (metrics) {
    metrics.profile_fetch_total_ms = Math.round(devPerfNow() - tAll0);
  }
  return toProfileRow(uid, row);
}
