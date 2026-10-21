import type { SupabaseClient, User } from "@supabase/supabase-js";
import { APPLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/apple-auth-env.server";
import { GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/google-auth-env.server";
import { KAKAO_NATIVE_AUTH_EMAIL_DOMAIN } from "@/lib/auth/native/kakao-auth-env.server";

/**
 * Native exchange 공통 — DIBAY synthetic 계정 판정 · 파생 비밀번호 seed · owner 세션 발급.
 *
 * P1-7: auth.users email/password 는 **같은 provider 의 DIBAY synthetic 계정**일 때만 갱신한다.
 * 그 외 owner(아이디·웹 OAuth·다른 provider 가입 회원)는 magiclink(token_hash) 로 세션만 발급하고
 * email·password·metadata 를 바꾸지 않는다.
 */
export type NativeSessionProvider = "google" | "kakao" | "apple";

/** service role 만 쓸 수 있는 app_metadata 마커 — DIBAY native exchange 가 만든 auth user (OA-10). */
export const DIBAY_NATIVE_PROVIDER_APP_METADATA_KEY = "dibay_native_provider";

const SYNTHETIC_DOMAIN: Record<NativeSessionProvider, string> = {
  google: GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN,
  kakao: KAKAO_NATIVE_AUTH_EMAIL_DOMAIN,
  apple: APPLE_NATIVE_AUTH_EMAIL_DOMAIN,
};

/** 각 provider create 경로가 user_metadata 에 기록하는 subject 키 (legacy 판정용). */
const SUBJECT_METADATA_KEY: Record<NativeSessionProvider, string> = {
  google: "google_id",
  kakao: "kakao_id",
  apple: "apple_sub",
};

export function isSameProviderSyntheticAuthEmail(
  provider: NativeSessionProvider,
  email: string | null | undefined,
): boolean {
  const normalized = String(email ?? "").trim().toLowerCase();
  return Boolean(normalized) && normalized.endsWith(`@${SYNTHETIC_DOMAIN[provider]}`);
}

/**
 * auth user 자격증명(email/password)을 이 provider 가 관리해도 되는가.
 * - 같은 provider synthetic email → true
 * - email 없음 → true (덮어쓸 owner email 이 없다)
 * - 그 외(실제 이메일·다른 provider synthetic·아이디 회원) → false
 */
export function nativeProviderOwnsAuthCredentials(
  provider: NativeSessionProvider,
  email: string | null | undefined,
): boolean {
  if (!String(email ?? "").trim()) return true;
  return isSameProviderSyntheticAuthEmail(provider, email);
}

export function buildDibayNativeAppMetadata(provider: NativeSessionProvider): Record<string, unknown> {
  return { [DIBAY_NATIVE_PROVIDER_APP_METADATA_KEY]: provider };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * OA-10 pre-hijack — createUser 실패 후 synthetic email 로 찾은 기존 auth user 를 채택해도 되는가.
 * 1) app_metadata 마커(service role 전용)가 같은 provider → 채택
 * 2) Kakao legacy: app_metadata.provider === "kakao" (기존 create 경로가 설정)
 * 3) legacy(마커 도입 전): user_metadata.provider + subject 키가 일치하고 identities 가 email 뿐
 * 그 외(외부 가입으로 선점된 계정 등)는 채택하지 않는다.
 */
export function canAdoptRecoveredNativeAuthUser(
  provider: NativeSessionProvider,
  user: Pick<User, "email" | "app_metadata" | "user_metadata" | "identities"> | null | undefined,
  providerUserId: string,
): boolean {
  if (!user || !isSameProviderSyntheticAuthEmail(provider, user.email)) return false;
  const app = readRecord(user.app_metadata);
  if (app[DIBAY_NATIVE_PROVIDER_APP_METADATA_KEY] === provider) return true;
  if (provider === "kakao" && app.provider === "kakao") return true;

  const meta = readRecord(user.user_metadata);
  if (meta.provider !== provider) return false;
  const subject = String(meta[SUBJECT_METADATA_KEY[provider]] ?? "").trim();
  if (!subject || subject.toLowerCase() !== String(providerUserId ?? "").trim().toLowerCase()) return false;
  const identities = Array.isArray(user.identities) ? user.identities : [];
  return identities.every((row) => String(row?.provider ?? "email") === "email");
}

/**
 * OA-13 — 파생 비밀번호 seed. provider 전용 env → SUPABASE_SERVICE_ROLE_KEY.
 * 하드코딩 fallback 없음 — 둘 다 없으면 throw (fail-closed).
 */
export function resolveNativePasswordSeed(providerSeedEnv: string | undefined): string {
  const seed = providerSeedEnv?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!seed) throw new Error("native_password_seed_missing");
  return seed;
}

/**
 * Owner 세션 발급 (자격증명 무변경): admin magiclink → route cookie client verifyOtp(token_hash).
 * 다른 user 로 발급·검증되면 세션을 지우고 throw.
 */
export async function mintNativeOwnerSessionViaMagicLink(
  adminSb: SupabaseClient,
  routeSb: SupabaseClient,
  ownerUserId: string,
  ownerEmail: string,
): Promise<User> {
  const email = String(ownerEmail ?? "").trim();
  if (!email) throw new Error("owner_email_missing");

  const { data: linkData, error: linkError } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = String(linkData?.properties?.hashed_token ?? "").trim();
  if (linkError || !tokenHash) {
    throw new Error(linkError?.message || "owner_magiclink_generate_failed");
  }
  if (linkData?.user?.id && linkData.user.id !== ownerUserId) {
    throw new Error("owner_magiclink_user_mismatch");
  }

  const { data: verified, error: verifyError } = await routeSb.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified?.user || !verified.session) {
    throw new Error(verifyError?.message || "owner_magiclink_verify_failed");
  }
  if (verified.user.id !== ownerUserId) {
    try {
      await routeSb.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
    throw new Error("owner_magiclink_user_mismatch");
  }
  return verified.user;
}

/**
 * P1-7 — `profiles.provider*` 는 최초 기록만. provider_user_id 가 이미 있으면 true (갱신 금지).
 * 조회 오류: `softOnError=true` 면 true(기록 건너뜀), 아니면 throw (호출부 500).
 */
export async function isProfileIdentitySet(
  adminSb: SupabaseClient,
  userId: string,
  softOnError = false,
): Promise<boolean> {
  const { data, error } = await adminSb
    .from("profiles")
    .select("provider_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (softOnError) return true;
    throw new Error(error.message || "profile_identity_read_failed");
  }
  return Boolean(String((data as { provider_user_id?: string | null } | null)?.provider_user_id ?? "").trim());
}
