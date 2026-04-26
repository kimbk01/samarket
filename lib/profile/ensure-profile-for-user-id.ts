import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "./types";
import { withDefaultAvatar } from "./default-avatar";
import { fetchProfileRowSafe } from "./fetch-profile-row-safe";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import { normalizeStoreAuthProvider } from "@/lib/auth/store-member-policy";

/**
 * `profiles.provider` / `profiles.auth_provider` 의 DB 제약(`profiles_provider_check`)은
 * `'google','kakao','naver','manual','email'` 만 허용한다.
 * 정책 코드는 `'admin_manual'` 을 사용하지만 저장 직전 `'manual'` 로 매핑한다.
 */
function toDbProvider(provider: string | null | undefined): string {
  const normalized = normalizeStoreAuthProvider(provider);
  if (!normalized) return "email";
  if (normalized === "admin_manual") return "manual";
  if (
    normalized === "google" ||
    normalized === "kakao" ||
    normalized === "naver" ||
    normalized === "manual" ||
    normalized === "email"
  ) {
    return normalized;
  }
  return "email";
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readFirstIdentityDataValue(
  identities: unknown,
  keys: string[]
): string | null {
  const list = Array.isArray(identities)
    ? (identities as Array<{ identity_data?: Record<string, unknown> | null }>)
    : [];
  for (const identity of list) {
    const data = identity.identity_data;
    if (!data || typeof data !== "object") continue;
    for (const key of keys) {
      const value = pickString(data[key]);
      if (value) return value;
    }
  }
  return null;
}

/**
 * `profiles` 행이 없고 Supabase Auth 에 해당 사용자가 있으면 최소 행을 upsert 한다.
 * - 아이디 로그인 쿠키는 남는데 public TRUNCATE 등으로 profiles 만 비는 경우 복구
 * - OAuth 첫 로그인 직후에도 service_role 클라이언트로 호출하면 `profiles` 가 항상 보장된다.
 *
 * 이중 안전망:
 *   1) 정책상 정상 컬럼이 모두 들어간 row 로 upsert
 *   2) 1) 이 제약/트리거로 거부되면 → id/email/display_name/nickname/updated_at 만의 최소 row 로 재시도
 *   ⇒ 어떤 환경에서도 `profiles.id` 만큼은 반드시 생성된다.
 */
export async function ensureProfileForUserId(
  sb: SupabaseClient<any>,
  userId: string
): Promise<ProfileRow | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const existing = await fetchProfileRowSafe(sb, uid);
  if (existing) return existing;

  const { data: authWrap, error: authErr } = await sb.auth.admin.getUserById(uid);
  if (authErr || !authWrap?.user) return null;

  const user = authWrap.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaUser =
    pickString(meta.username) ||
    pickString(meta.login_id) ||
    null;
  const metaNick =
    pickString(meta.nickname) ||
    pickString(meta.full_name) ||
    pickString(meta.name) ||
    metaUser ||
    null;
  const email = user.email?.trim() ?? null;
  const preferredLanguage = normalizeAppLanguage(meta.preferred_language);
  const username =
    (metaUser || (email && email.includes("@") ? email.split("@")[0] : null)) ?? null;
  const nicknameRaw =
    metaNick || username || (email && email.includes("@") ? email.split("@")[0] : null);
  const nickname = (nicknameRaw && nicknameRaw.length > 0 ? nicknameRaw : "회원").slice(0, 20);
  const rawProvider =
    (typeof meta.provider === "string" && meta.provider.trim()) ||
    (typeof meta.auth_provider === "string" && meta.auth_provider.trim()) ||
    (typeof user.app_metadata?.provider === "string" && user.app_metadata.provider.trim()) ||
    "email";
  const dbProvider = toDbProvider(rawProvider);
  const isAdminManual = normalizeStoreAuthProvider(rawProvider) === "admin_manual";
  const nowIso = new Date().toISOString();
  /** `profiles_status_check` 호환 (`'sns_pending','verified_user','suspended','deleted'`) */
  const dbStatus: "verified_user" | "sns_pending" = isAdminManual ? "verified_user" : "sns_pending";
  const oauthAvatar = withDefaultAvatar(
    pickString(meta.picture) ??
      pickString(meta.avatar_url) ??
      pickString(meta.photo_url) ??
      pickString(meta.image) ??
      readFirstIdentityDataValue(user.identities, ["picture", "avatar_url", "photo_url", "image"])
  );

  const fullPayload: Record<string, unknown> = {
    id: uid,
    email,
    display_name: nickname,
    username,
    nickname,
    auth_login_email: email,
    role: "user",
    is_admin: false,
    member_type: "normal",
    is_special_member: false,
    phone_verified: isAdminManual,
    phone_verified_at: isAdminManual ? nowIso : null,
    phone_verification_status: isAdminManual ? "verified" : "unverified",
    phone_verification_method: isAdminManual ? "admin_manual" : null,
    realname_verified: false,
    status: dbStatus,
    member_status: isAdminManual ? "verified_member" : "sns_member",
    avatar_url: oauthAvatar,
    preferred_language: preferredLanguage,
    preferred_country: "PH",
    provider: dbProvider,
    auth_provider: dbProvider,
    phone_country_code: "+63",
    updated_at: nowIso,
  };

  const { error: upErr } = await sb.from("profiles").upsert(fullPayload, { onConflict: "id" });
  if (upErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ensureProfileForUserId] full upsert failed → minimal fallback", {
        message: upErr.message,
        userId: uid,
      });
    }
    const minimalPayload = {
      id: uid,
      email,
      display_name: nickname,
      nickname,
      avatar_url: oauthAvatar,
      updated_at: nowIso,
    };
    const { error: minErr } = await sb
      .from("profiles")
      .upsert(minimalPayload, { onConflict: "id" });
    if (minErr) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ensureProfileForUserId] minimal upsert failed → id-only fallback", {
          message: minErr.message,
          userId: uid,
        });
      }
      const idOnly = await sb.from("profiles").upsert({ id: uid }, { onConflict: "id" });
      if (idOnly.error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ensureProfileForUserId] id-only upsert also failed", {
            message: idOnly.error.message,
            userId: uid,
          });
        }
        return null;
      }
    }
  }

  return (await fetchProfileRowSafe(sb, uid)) ?? null;
}
