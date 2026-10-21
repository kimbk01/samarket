import { Mail } from "lucide-react";
import { SiApple, SiFacebook, SiNaver } from "react-icons/si";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 로그인 버튼 브랜드 토큰 단일 파일 (§5.5 · P1-16).
 * - Google: 공식 4색 "G" (재색칠 금지) · 흰 배경 + 1px #747775 테두리 · 라벨 #1F1F1F
 * - Kakao: #FEE500 배경 · 검정 말풍선 심볼 · 라벨 rgba(0,0,0,0.85)
 * - Apple: 검정 배경 · 흰 로고 (변경 없음)
 * 다크 모드에서도 브랜드 색을 고정한다 (sam 토큰으로 바꾸지 않는다).
 */
export type OAuthLoginPrimaryStyle = {
  buttonClassName: string;
  labelClassName: string;
};

/** 버튼이 붙는 표면 — page = 화면 카드(4px) / overlay = 시트·다이얼로그(--overlay-radius-md). */
export type OAuthLoginButtonSurface = "page" | "overlay";

const OAUTH_LOGIN_PRIMARY_STYLES: Record<
  Exclude<OAuthProvider, "facebook">,
  OAuthLoginPrimaryStyle
> = {
  kakao: {
    buttonClassName: "bg-[#FEE500] hover:brightness-[0.98] active:brightness-95",
    labelClassName: "text-[rgba(0,0,0,0.85)]",
  },
  naver: {
    buttonClassName: "bg-[#03C75A] hover:brightness-[0.98] active:brightness-95",
    labelClassName: "text-white",
  },
  apple: {
    buttonClassName: "bg-black hover:brightness-[0.98] active:brightness-95",
    labelClassName: "text-white",
  },
  google: {
    buttonClassName: "border border-[#747775] bg-white hover:bg-[#F8F9FA] active:bg-[#F1F3F4]",
    labelClassName: "text-[#1F1F1F]",
  },
};

const OAUTH_LOGIN_PRIMARY_BUTTON_LAYOUT =
  "flex w-full items-center gap-3 px-4 py-3.5 transition-transform duration-100 active:scale-[0.985] disabled:opacity-50 disabled:active:scale-100";

export function getOAuthLoginPrimaryButtonBase(surface: OAuthLoginButtonSurface = "page"): string {
  const radius = surface === "overlay" ? "rounded-[length:var(--overlay-radius-md)]" : "rounded-ui-rect";
  return `${OAUTH_LOGIN_PRIMARY_BUTTON_LAYOUT} ${radius}`;
}

/** 오버레이 패널(OAuthProviderLoginPanel)·launch 화면 호환용 — 신규 사용처는 getOAuthLoginPrimaryButtonBase(surface). */
export const OAUTH_LOGIN_PRIMARY_BUTTON_BASE = getOAuthLoginPrimaryButtonBase("overlay");

export const OAUTH_LOGIN_SECONDARY_CIRCLE_BASE =
  "flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-100 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100";

const OAUTH_LOGIN_ICON_CLASS: Record<"naver" | "apple" | "facebook" | "email", string> = {
  naver: "text-white",
  apple: "text-white",
  facebook: "text-white",
  email: "text-white",
};

export function getOAuthLoginPrimaryStyle(provider: OAuthProvider): OAuthLoginPrimaryStyle | null {
  if (provider === "facebook") {
    return {
      buttonClassName: "bg-[#1877F2] hover:brightness-[0.98] active:brightness-95",
      labelClassName: "text-white",
    };
  }
  return OAUTH_LOGIN_PRIMARY_STYLES[provider];
}

export function getOAuthLoginContinueLabelKey(provider: OAuthProvider): MessageKey {
  if (provider === "kakao") return "auth_provider_continue_kakao";
  if (provider === "naver") return "auth_provider_continue_naver";
  if (provider === "apple") return "auth_provider_continue_apple";
  if (provider === "google") return "auth_provider_continue_google";
  return "auth_provider_continue_facebook";
}

/** Google 공식 4색 "G" — fill 고정 (currentColor 미사용). */
export function GoogleBrandMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="shrink-0"
      aria-hidden
      focusable="false"
      data-brand-mark="google"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Kakao 말풍선 심볼 — 검정 고정. */
export function KakaoBrandMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      aria-hidden
      focusable="false"
      data-brand-mark="kakao"
    >
      <path
        fill="#000000"
        d="M12 3C6.48 3 2 6.51 2 10.84c0 2.8 1.86 5.26 4.66 6.65-.15.53-.98 3.4-1.01 3.62 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.66-2.4 4.24-2.81.58.08 1.17.13 1.78.13 5.52 0 10-3.51 10-7.84S17.52 3 12 3z"
      />
    </svg>
  );
}

export function OAuthLoginProviderIcon({
  provider,
  size = "primary",
}: {
  provider: OAuthProvider | "email";
  size?: "primary" | "secondary";
}) {
  const pixelSize = size === "primary" ? 24 : 20;

  if (provider === "google") return <GoogleBrandMark size={pixelSize - 2} />;
  if (provider === "kakao") return <KakaoBrandMark size={pixelSize} />;

  const iconClassName = `shrink-0 ${OAUTH_LOGIN_ICON_CLASS[provider]}`;
  if (provider === "email") {
    return <Mail size={pixelSize} strokeWidth={2.2} className={iconClassName} aria-hidden />;
  }
  const Icon = provider === "apple" ? SiApple : provider === "naver" ? SiNaver : SiFacebook;
  return <Icon size={pixelSize} className={iconClassName} aria-hidden />;
}
