import { resolveGoogleNativeAllowedAudiences } from "@/lib/auth/native/google-auth-env.server";

export type GoogleVerifiedIdentity = {
  googleUserId: string;
  audience: string;
  email?: string | null;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
};

export type GoogleTokenVerifyErrorCode =
  | "google_token_missing"
  | "google_token_verify_failed"
  | "google_token_invalid"
  | "google_token_invalid_audience";

export class GoogleTokenVerifyError extends Error {
  code: GoogleTokenVerifyErrorCode;

  constructor(code: GoogleTokenVerifyErrorCode, message: string) {
    super(message);
    this.name = "GoogleTokenVerifyError";
    this.code = code;
  }
}

export function mapGoogleVerifyErrorToHttp(error: GoogleTokenVerifyError): {
  errorCode: string;
  message: string;
  status: number;
} {
  if (error.code === "google_token_missing" || error.code === "google_token_invalid") {
    return { errorCode: "native_exchange_bad_request", message: error.message, status: 400 };
  }
  if (error.code === "google_token_invalid_audience") {
    return { errorCode: "google_token_invalid_audience", message: error.message, status: 401 };
  }
  return { errorCode: "native_exchange_verify_failed", message: error.message, status: 401 };
}

type GoogleTokenInfoResponse = {
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  iss?: string;
  exp?: string;
  name?: string;
  picture?: string;
  error_description?: string;
};

function readBoolean(value: unknown): boolean {
  if (value === true || value === "true") return true;
  return false;
}

function isAllowedIssuer(iss: string): boolean {
  const normalized = iss.trim().toLowerCase();
  return normalized === "accounts.google.com" || normalized === "https://accounts.google.com";
}

export async function verifyGoogleIdToken(input: { idToken: string }): Promise<GoogleVerifiedIdentity> {
  const idToken = String(input.idToken ?? "").trim();
  if (!idToken) {
    throw new GoogleTokenVerifyError("google_token_missing", "Google id token is required");
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    { cache: "no-store" },
  );

  const json = (await res.json().catch(() => null)) as GoogleTokenInfoResponse | null;
  if (!res.ok || !json) {
    const detail = json?.error_description?.trim();
    throw new GoogleTokenVerifyError(
      "google_token_verify_failed",
      detail || `Google id token verification failed (${res.status})`,
    );
  }

  const sub = String(json.sub ?? "").trim();
  const aud = String(json.aud ?? "").trim();
  const iss = String(json.iss ?? "").trim();
  if (!sub || !aud || !iss) {
    throw new GoogleTokenVerifyError("google_token_invalid", "Google id token response is invalid");
  }
  if (!isAllowedIssuer(iss)) {
    throw new GoogleTokenVerifyError("google_token_invalid", "Google id token issuer is invalid");
  }

  const allowedAudiences = resolveGoogleNativeAllowedAudiences();
  if (allowedAudiences.length === 0) {
    throw new GoogleTokenVerifyError(
      "google_token_invalid_audience",
      "Google native audiences are not configured — set AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID",
    );
  }
  if (!allowedAudiences.includes(aud)) {
    throw new GoogleTokenVerifyError(
      "google_token_invalid_audience",
      "Google id token audience is not allowed",
    );
  }

  const exp = Number(json.exp ?? 0);
  if (Number.isFinite(exp) && exp > 0 && exp * 1000 < Date.now()) {
    throw new GoogleTokenVerifyError("google_token_invalid", "Google id token is expired");
  }

  return {
    googleUserId: sub,
    audience: aud,
    email: json.email?.trim() || null,
    emailVerified: readBoolean(json.email_verified),
    name: json.name?.trim() || null,
    picture: json.picture?.trim() || null,
  };
}
