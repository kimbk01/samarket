import type { LinkableAuthProvider, StoredAuthProvider } from "@/lib/auth/provider-identity/types";

const PROVIDER_LABEL_KO: Record<StoredAuthProvider, string> = {
  google: "Google",
  kakao: "카카오",
  apple: "Apple",
  naver: "네이버",
  facebook: "Facebook",
  email: "이메일",
};

const PROVIDER_LABEL_EN: Record<StoredAuthProvider, string> = {
  google: "Google",
  kakao: "Kakao",
  apple: "Apple",
  naver: "Naver",
  facebook: "Facebook",
  email: "Email",
};

export function resolveProviderDisplayName(
  provider: StoredAuthProvider | string | null | undefined,
  lang: "ko" | "en" = "ko",
): string {
  const key = String(provider ?? "").trim().toLowerCase() as StoredAuthProvider;
  const table = lang === "en" ? PROVIDER_LABEL_EN : PROVIDER_LABEL_KO;
  return table[key] ?? (lang === "en" ? "Sign-in method" : "로그인 방식");
}

export function isLinkableAuthProvider(value: string): value is LinkableAuthProvider {
  return value === "google" || value === "kakao" || value === "apple";
}
