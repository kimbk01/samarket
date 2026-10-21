import { readKakaoAppIdEnv } from "@/lib/auth/native/kakao-auth-env.server";

export type KakaoVerifiedIdentity = {
  kakaoUserId: string;
  appId?: number | null;
  expiresIn?: number | null;
  nickname?: string | null;
  profileImageUrl?: string | null;
  email?: string | null;
  /** access_token_info 만으로는 email 미제공 — /v2/user/me optional */
  hasEmailFromProfile: boolean;
};

export type KakaoTokenVerifyErrorCode =
  | "kakao_token_missing"
  | "kakao_token_verify_failed"
  | "kakao_token_invalid"
  | "kakao_token_app_mismatch";

export class KakaoTokenVerifyError extends Error {
  code: KakaoTokenVerifyErrorCode;

  constructor(code: KakaoTokenVerifyErrorCode, message: string) {
    super(message);
    this.name = "KakaoTokenVerifyError";
    this.code = code;
  }
}

export function mapKakaoVerifyErrorToHttp(error: KakaoTokenVerifyError): {
  errorCode: string;
  message: string;
  status: number;
} {
  if (error.code === "kakao_token_missing" || error.code === "kakao_token_invalid") {
    return { errorCode: "native_exchange_bad_request", message: error.message, status: 400 };
  }
  return { errorCode: "native_exchange_verify_failed", message: error.message, status: 401 };
}

type KakaoAccessTokenInfoResponse = {
  id?: number;
  app_id?: number;
  expires_in?: number;
};

type KakaoUserMeResponse = {
  id?: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
};

async function fetchKakaoAccessTokenInfo(accessToken: string): Promise<KakaoAccessTokenInfoResponse> {
  const res = await fetch("https://kapi.kakao.com/v1/user/access_token_info", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new KakaoTokenVerifyError(
      "kakao_token_verify_failed",
      `Kakao access token verification failed (${res.status})`,
    );
  }

  const json = (await res.json().catch(() => null)) as KakaoAccessTokenInfoResponse | null;
  if (!json || typeof json.id !== "number") {
    throw new KakaoTokenVerifyError("kakao_token_invalid", "Kakao access token response is invalid");
  }
  return json;
}

let kakaoAppIdEnvMissingWarned = false;

/**
 * P1-2 — 다른 Kakao 앱이 발급한 access token 거부.
 * `KAKAO_APP_ID` 설정 시 `app_id` 일치 필수. 미설정이면 로그인 장애 방지를 위해 통과 + 1회 경고.
 */
function assertKakaoTokenAppId(tokenInfo: KakaoAccessTokenInfoResponse): void {
  const expectedAppId = readKakaoAppIdEnv();
  if (expectedAppId === null) {
    if (!kakaoAppIdEnvMissingWarned) {
      kakaoAppIdEnvMissingWarned = true;
      console.warn("[auth/kakao-native]", JSON.stringify({ event: "kakao_app_id_env_missing" }));
    }
    return;
  }
  if (tokenInfo.app_id !== expectedAppId) {
    throw new KakaoTokenVerifyError(
      "kakao_token_app_mismatch",
      "Kakao access token was not issued for this app",
    );
  }
}

async function fetchKakaoUserProfile(accessToken: string): Promise<KakaoUserMeResponse | null> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as KakaoUserMeResponse | null;
}

/**
 * Kakao SDK accessToken → REST verify → provider_user_id.
 * 클라이언트 token 은 절대 신뢰하지 않는다.
 */
export async function verifyKakaoNativeCredential(input: {
  accessToken?: string | null;
  idToken?: string | null;
}): Promise<KakaoVerifiedIdentity> {
  const accessToken = String(input.accessToken ?? "").trim();
  if (!accessToken) {
    const idToken = String(input.idToken ?? "").trim();
    if (idToken) {
      throw new KakaoTokenVerifyError(
        "kakao_token_missing",
        "Kakao native exchange requires accessToken from SDK (idToken-only verify is not enabled)",
      );
    }
    throw new KakaoTokenVerifyError("kakao_token_missing", "Kakao access token is required");
  }

  const tokenInfo = await fetchKakaoAccessTokenInfo(accessToken);
  assertKakaoTokenAppId(tokenInfo);
  const kakaoUserId = String(tokenInfo.id);

  let nickname: string | null = null;
  let profileImageUrl: string | null = null;
  let email: string | null = null;
  let hasEmailFromProfile = false;

  const profile = await fetchKakaoUserProfile(accessToken);
  if (profile) {
    nickname =
      profile.kakao_account?.profile?.nickname?.trim()
      || profile.properties?.nickname?.trim()
      || null;
    profileImageUrl =
      profile.kakao_account?.profile?.profile_image_url?.trim()
      || profile.properties?.profile_image?.trim()
      || null;
    const profileEmail = profile.kakao_account?.email?.trim().toLowerCase();
    if (profileEmail) {
      email = profileEmail;
      hasEmailFromProfile = true;
    }
  }

  return {
    kakaoUserId,
    appId: tokenInfo.app_id ?? null,
    expiresIn: tokenInfo.expires_in ?? null,
    nickname,
    profileImageUrl,
    email,
    hasEmailFromProfile,
  };
}
