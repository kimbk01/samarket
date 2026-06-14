import type { AppleVerifiedIdentityToken } from "@/lib/auth/native/apple-token-verify.server";
import {
  AppleTokenVerifyError,
  mapAppleVerifyErrorToHttp,
  verifyAppleIdentityToken,
} from "@/lib/auth/native/apple-token-verify.server";
import { establishAppleNativeSession } from "@/lib/auth/native/apple-native-session.server";
import { establishGoogleNativeSession } from "@/lib/auth/native/google-native-session.server";
import {
  GoogleTokenVerifyError,
  mapGoogleVerifyErrorToHttp,
  verifyGoogleIdToken,
  type GoogleVerifiedIdentity,
} from "@/lib/auth/native/google-token-verify.server";
import { establishKakaoNativeSession } from "@/lib/auth/native/kakao-native-session.server";
import {
  KakaoTokenVerifyError,
  mapKakaoVerifyErrorToHttp,
  verifyKakaoNativeCredential,
  type KakaoVerifiedIdentity,
} from "@/lib/auth/native/kakao-token-verify.server";
import {
  missingCredentialMessage,
  resolveNativeExchangeCredential,
} from "@/lib/auth/native/native-exchange-contract.server";
import { nativeExchangeSessionUnavailable } from "@/lib/auth/native/native-exchange-errors.server";
import {
  NATIVE_EXCHANGE_PROVIDERS,
  type NativeExchangeContext,
  type NativeExchangeFailure,
  type NativeExchangeProvider,
  type NativeExchangeRequest,
  type NativeExchangeResult,
  type VerifiedNativeIdentity,
} from "@/lib/auth/native/native-exchange-types.server";
import { nativeExchangeBadRequest } from "@/lib/auth/native/native-exchange-errors.server";

export type NativeProviderAdapter = {
  provider: NativeExchangeProvider;
  /** false = verify+session 구현됨 (Apple) */
  stub: boolean;
  validateInput(input: NativeExchangeRequest): NativeExchangeFailure | null;
  verify(input: NativeExchangeRequest): Promise<VerifiedNativeIdentity | NativeExchangeFailure>;
  establishSession(
    identity: VerifiedNativeIdentity,
    context: NativeExchangeContext,
    input: NativeExchangeRequest,
  ): Promise<NativeExchangeResult>;
};

function validateRequiredCredential(
  input: NativeExchangeRequest,
): NativeExchangeFailure | null {
  const credential = resolveNativeExchangeCredential(input);
  if (!credential) {
    return nativeExchangeBadRequest(missingCredentialMessage(input.provider));
  }
  return null;
}

function mapNativeSessionFailure(
  session: {
    ok: false;
    errorCode: string;
    message: string;
    status: number;
    conflict?: {
      email: string;
      attemptedProvider: string;
      existingProviders: string[];
      existingUserId: string;
      stashToken: string;
    };
  },
): NativeExchangeFailure {
  if (session.errorCode === "provider_email_conflict" && session.conflict) {
    return {
      ok: false,
      errorCode: "provider_email_conflict",
      message: session.message,
      status: session.status,
      conflict: {
        email: session.conflict.email,
        attemptedProvider: session.conflict.attemptedProvider,
        existingProviders: session.conflict.existingProviders,
        existingUserId: session.conflict.existingUserId,
        stashToken: session.conflict.stashToken,
      },
    };
  }
  if (session.errorCode === "provider_account_conflict") {
    return {
      ok: false,
      errorCode: "native_exchange_account_conflict",
      message: session.message,
      status: session.status,
    };
  }
  return session;
}

function toVerifiedAppleIdentity(
  verified: AppleVerifiedIdentityToken,
  userIdentifier?: string | null,
): VerifiedNativeIdentity {
  return {
    provider: "apple",
    providerUserId: verified.sub,
    email: verified.email,
    emailVerified: verified.email ? !verified.isPrivateRelayEmail : undefined,
    rawClaims: {
      appleVerified: verified,
      userIdentifier: userIdentifier ?? null,
    },
  };
}

export const appleNativeProviderAdapter: NativeProviderAdapter = {
  provider: "apple",
  stub: false,

  validateInput(input) {
    return validateRequiredCredential(input);
  },

  async verify(input) {
    const identityToken = resolveNativeExchangeCredential(input);
    if (!identityToken) {
      return nativeExchangeBadRequest(missingCredentialMessage("apple"));
    }

    try {
      const verified = await verifyAppleIdentityToken({
        identityToken,
        expectedNonce: input.nonce,
      });
      return toVerifiedAppleIdentity(verified, input.userIdentifier);
    } catch (error) {
      if (error instanceof AppleTokenVerifyError) {
        const mapped = mapAppleVerifyErrorToHttp(error);
        return {
          ok: false,
          errorCode: mapped.errorCode,
          message: mapped.message,
          status: mapped.status,
        };
      }
      return {
        ok: false,
        errorCode: "apple_token_verify_failed",
        message: "Apple identity token verification failed",
        status: 401,
      };
    }
  },

  async establishSession(identity, context, input) {
    const appleVerified = identity.rawClaims?.appleVerified as AppleVerifiedIdentityToken | undefined;
    if (!appleVerified) {
      return nativeExchangeSessionUnavailable("Apple verified identity payload is missing");
    }

    const session = await establishAppleNativeSession(context, {
      verified: appleVerified,
      userIdentifier: input.userIdentifier,
      next: input.next,
    });

    if (!session.ok) {
      return mapNativeSessionFailure(session);
    }

    return {
      ok: true,
      provider: "apple",
      userId: session.userId,
      redirectTo: session.redirectTo,
      signupComplete: session.signupComplete,
      sessionEstablished: true,
      isNewUser: session.isNewUser,
      needsProfileCompletion: session.needsProfileCompletion,
      needsTermsAgreement: session.needsTermsAgreement,
    };
  },
};

function toVerifiedKakaoIdentity(verified: KakaoVerifiedIdentity): VerifiedNativeIdentity {
  return {
    provider: "kakao",
    providerUserId: verified.kakaoUserId,
    email: verified.email,
    emailVerified: verified.hasEmailFromProfile ? Boolean(verified.email) : undefined,
    displayName: verified.nickname,
    avatarUrl: verified.profileImageUrl,
    rawClaims: { kakaoVerified: verified },
  };
}

export const kakaoNativeProviderAdapter: NativeProviderAdapter = {
  provider: "kakao",
  stub: false,

  validateInput(input) {
    return validateRequiredCredential(input);
  },

  async verify(input) {
    try {
      const verified = await verifyKakaoNativeCredential({
        accessToken: input.accessToken ?? input.token,
        idToken: input.idToken,
      });
      return toVerifiedKakaoIdentity(verified);
    } catch (error) {
      if (error instanceof KakaoTokenVerifyError) {
        const mapped = mapKakaoVerifyErrorToHttp(error);
        return {
          ok: false,
          errorCode: mapped.errorCode,
          message: mapped.message,
          status: mapped.status,
        };
      }
      return {
        ok: false,
        errorCode: "native_exchange_verify_failed",
        message: "Kakao token verification failed",
        status: 401,
      };
    }
  },

  async establishSession(identity, context, input) {
    const kakaoVerified = identity.rawClaims?.kakaoVerified as KakaoVerifiedIdentity | undefined;
    if (!kakaoVerified) {
      return nativeExchangeSessionUnavailable("Kakao verified identity payload is missing");
    }

    const session = await establishKakaoNativeSession(context, {
      verified: kakaoVerified,
      next: input.next,
    });

    if (!session.ok) {
      return mapNativeSessionFailure(session);
    }

    return {
      ok: true,
      provider: "kakao",
      userId: session.userId,
      redirectTo: session.redirectTo,
      signupComplete: session.signupComplete,
      sessionEstablished: true,
      isNewUser: session.isNewUser,
      needsProfileCompletion: session.needsProfileCompletion,
      needsTermsAgreement: session.needsTermsAgreement,
    };
  },
};

function toVerifiedGoogleIdentity(verified: GoogleVerifiedIdentity): VerifiedNativeIdentity {
  return {
    provider: "google",
    providerUserId: verified.googleUserId,
    email: verified.email,
    emailVerified: verified.emailVerified,
    displayName: verified.name,
    avatarUrl: verified.picture,
    rawClaims: { googleVerified: verified },
  };
}

export const googleNativeProviderAdapter: NativeProviderAdapter = {
  provider: "google",
  stub: false,

  validateInput(input) {
    return validateRequiredCredential(input);
  },

  async verify(input) {
    const idToken = resolveNativeExchangeCredential(input);
    if (!idToken) {
      return nativeExchangeBadRequest(missingCredentialMessage("google"));
    }

    try {
      const verified = await verifyGoogleIdToken({ idToken });
      return toVerifiedGoogleIdentity(verified);
    } catch (error) {
      if (error instanceof GoogleTokenVerifyError) {
        const mapped = mapGoogleVerifyErrorToHttp(error);
        return {
          ok: false,
          errorCode: mapped.errorCode,
          message: mapped.message,
          status: mapped.status,
        };
      }
      return {
        ok: false,
        errorCode: "native_exchange_verify_failed",
        message: "Google id token verification failed",
        status: 401,
      };
    }
  },

  async establishSession(identity, context, input) {
    const googleVerified = identity.rawClaims?.googleVerified as GoogleVerifiedIdentity | undefined;
    if (!googleVerified) {
      return nativeExchangeSessionUnavailable("Google verified identity payload is missing");
    }

    const session = await establishGoogleNativeSession(context, {
      verified: googleVerified,
      next: input.next,
    });

    if (!session.ok) {
      return mapNativeSessionFailure(session);
    }

    return {
      ok: true,
      provider: "google",
      userId: session.userId,
      redirectTo: session.redirectTo,
      signupComplete: session.signupComplete,
      sessionEstablished: true,
      isNewUser: session.isNewUser,
      needsProfileCompletion: session.needsProfileCompletion,
      needsTermsAgreement: session.needsTermsAgreement,
    };
  },
};

function createStubAdapter(provider: Exclude<NativeExchangeProvider, "apple" | "kakao" | "google">): NativeProviderAdapter {
  return {
    provider,
    stub: true,
    validateInput(input) {
      return validateRequiredCredential(input);
    },
    async verify() {
      throw new Error(`${provider} stub adapter must not call verify`);
    },
    async establishSession() {
      throw new Error(`${provider} stub adapter must not call establishSession`);
    },
  };
}

export const facebookNativeProviderAdapter = createStubAdapter("facebook");

const ADAPTER_BY_PROVIDER: Record<NativeExchangeProvider, NativeProviderAdapter> = {
  apple: appleNativeProviderAdapter,
  kakao: kakaoNativeProviderAdapter,
  google: googleNativeProviderAdapter,
  facebook: facebookNativeProviderAdapter,
};

export function getNativeProviderAdapter(
  provider: NativeExchangeProvider,
): NativeProviderAdapter {
  return ADAPTER_BY_PROVIDER[provider];
}

export function listNativeProviderAdapters(): NativeProviderAdapter[] {
  return NATIVE_EXCHANGE_PROVIDERS.map((provider) => ADAPTER_BY_PROVIDER[provider]);
}
