import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "./types";
import { DEFAULT_PROFILE_ROW } from "./types";

/**
 * PostgREST/DB 스키마가 마이그레이션보다 앞서거나 뒤처진 경우 `select("*")`·과도한 컬럼 목록이 500을 유발할 수 있음.
 * 내정보·ensureProfile 등은 단계적 select 로 행을 읽는다.
 */
const SELECT_FULL = [
  "id",
  "email",
  "nickname",
  "avatar_url",
  "bio",
  "region_code",
  "region_name",
  "address_street_line",
  "address_detail",
  "phone",
  "phone_verified",
  "phone_verification_status",
  "realname",
  "realname_verified",
  "status",
  "role",
  "member_type",
  "is_special_member",
  "points",
  "manner_score",
  "trust_score",
  "preferred_language",
  "preferred_country",
  "notify_commerce_email",
  "created_at",
  "updated_at",
  "username",
  "auth_provider",
].join(", ");

const SELECT_MID = [
  "id",
  "email",
  "username",
  "nickname",
  "avatar_url",
  "bio",
  "region_code",
  "region_name",
  "phone",
  "phone_verified",
  "phone_verification_status",
  "realname",
  "realname_verified",
  "status",
  "role",
  "member_type",
  "is_special_member",
  "points",
  "manner_score",
  "trust_score",
  "preferred_language",
  "preferred_country",
  "created_at",
  "updated_at",
  "auth_provider",
].join(", ");

const SELECT_MEMBER =
  "id, email, username, nickname, avatar_url, role, member_type, status, phone, phone_verified, phone_verification_status, auth_provider";

/** username·auth_provider 가 아주 옛 스키마에 없을 때 */
const SELECT_LEGACY =
  "id, email, nickname, avatar_url, role, member_type, status, phone, phone_verified, phone_verification_status";

const SELECT_OPTIONAL = "address_street_line, address_detail, notify_commerce_email";

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
  base: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data, error } = await sb.from("profiles").select(SELECT_OPTIONAL).eq("id", userId).maybeSingle();
  if (error || !data) return base;
  return { ...base, ...(data as Record<string, unknown>) };
}

function toProfileRow(userId: string, row: Record<string, unknown>): ProfileRow {
  return {
    ...DEFAULT_PROFILE_ROW,
    ...row,
    id: userId,
    phone_verified: Boolean(row.phone_verified),
    realname_verified: Boolean(row.realname_verified),
    is_special_member: Boolean(row.is_special_member),
    points: Number(row.points ?? 0) || 0,
    manner_score: Number(row.manner_score ?? 50) || 50,
    trust_score: row.trust_score != null ? Number(row.trust_score) : 50,
  } as ProfileRow;
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
  userId: string
): Promise<ProfileRow | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const tryLists = [SELECT_FULL, SELECT_MID, SELECT_MEMBER, SELECT_LEGACY];
  let row: Record<string, unknown> | null = null;

  for (const list of tryLists) {
    const { data, error } = await selectProfileRaw(sb, uid, list);
    if (!error && data) {
      row = data;
      break;
    }
    if (error && !isProfileSelectSchemaError(error.message)) {
      return null;
    }
  }

  if (!row) return null;

  row = await mergeOptionalFields(sb, uid, row);
  return toProfileRow(uid, row);
}
