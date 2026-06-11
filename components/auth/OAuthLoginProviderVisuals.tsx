import type { IconType } from "react-icons";
import { Mail } from "lucide-react";
import { SiApple, SiFacebook, SiGoogle, SiKakaotalk, SiNaver } from "react-icons/si";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import type { MessageKey } from "@/lib/i18n/messages";

export type OAuthLoginPrimaryStyle = {
  buttonClassName: string;
  labelClassName: string;
};

const OAUTH_LOGIN_PRIMARY_STYLES: Record<
  Exclude<OAuthProvider, "facebook">,
  OAuthLoginPrimaryStyle
> = {
  kakao: {
    buttonClassName: "bg-[#FEE500] hover:brightness-[0.98] active:brightness-95",
    labelClassName: "text-[#3C1E1E]",
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
    buttonClassName:
      "border-2 border-[#dadce0] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.18)] hover:bg-white hover:shadow-[0_2px_6px_rgba(60,64,67,0.22)] active:bg-[#f8f9fa]",
    labelClassName: "text-[#1f1f1f]",
  },
};

export const OAUTH_LOGIN_PRIMARY_BUTTON_BASE =
  "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 transition-transform duration-100 active:scale-[0.985] disabled:opacity-50 disabled:active:scale-100";

export const OAUTH_LOGIN_SECONDARY_CIRCLE_BASE =
  "flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-100 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100";

const OAUTH_LOGIN_PROVIDER_ICONS: Record<OAuthProvider, IconType> = {
  kakao: SiKakaotalk,
  naver: SiNaver,
  apple: SiApple,
  google: SiGoogle,
  facebook: SiFacebook,
};

const OAUTH_LOGIN_ICON_CLASS: Record<OAuthProvider | "email", string> = {
  kakao: "text-[#3C1E1E]",
  naver: "text-white",
  apple: "text-white",
  google: "",
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

export function OAuthLoginProviderIcon({
  provider,
  size = "primary",
}: {
  provider: OAuthProvider | "email";
  size?: "primary" | "secondary";
}) {
  const pixelSize = size === "primary" ? 24 : 20;
  const iconClassName = `shrink-0 ${OAUTH_LOGIN_ICON_CLASS[provider]}`;

  if (provider === "email") {
    return <Mail size={pixelSize} strokeWidth={2.2} className={iconClassName} aria-hidden />;
  }

  const Icon = OAUTH_LOGIN_PROVIDER_ICONS[provider];
  return <Icon size={pixelSize} className={iconClassName} aria-hidden />;
}
