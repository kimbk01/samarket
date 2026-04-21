"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_LANGUAGE_COOKIE, detectBrowserAppLanguage } from "@/lib/i18n/config";
import { getSupabaseClient } from "@/lib/supabase/client";

type OAuthProvider = "google" | "kakao" | "apple";

function SignupPageContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const next = searchParams.get("next")?.trim() || "/mypage/account";
  const supabaseReady = useMemo(() => !!getSupabaseClient(), []);
  const providers: Array<{ id: OAuthProvider; label: string }> = [
    { id: "google", label: t("signup_google") },
    { id: "kakao", label: t("signup_kakao") },
    { id: "apple", label: t("signup_apple") },
  ];
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const handleOAuth = async (provider: OAuthProvider) => {
    setError("");
    setDone("");
    setBusy(provider);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase 설정이 없습니다.");
        return;
      }
      const nick = nickname.trim().slice(0, 20);
      const preferredLanguage = detectBrowserAppLanguage();
      if (typeof document !== "undefined" && nick) {
        document.cookie = `samarket_signup_nickname=${encodeURIComponent(nick)}; path=/; max-age=600; SameSite=Lax`;
      }
      if (typeof document !== "undefined") {
        document.cookie = `${APP_LANGUAGE_COOKIE}=${encodeURIComponent(preferredLanguage)}; path=/; max-age=600; SameSite=Lax`;
      }
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : undefined;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });
      if (oauthError) {
        setError(oauthError.message || "소셜 회원가입을 시작하지 못했습니다.");
      }
    } catch {
      setError("소셜 회원가입을 시작하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone("");
    setBusy("email");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase 설정이 없습니다.");
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            nickname: nickname.trim(),
            auth_provider: "email",
            preferred_language: detectBrowserAppLanguage(),
          },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
              : undefined,
        },
      });
      if (signUpError) {
        setError(signUpError.message || "회원가입에 실패했습니다.");
        return;
      }
      setDone(
        "가입 요청이 완료되었습니다. 이메일 확인이 필요한 경우 메일을 확인한 뒤 로그인하고, 이후 필리핀 전화번호 인증을 완료해 주세요."
      );
    } catch {
      setError("회원가입에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-sam-fg">{t("signup_title")}</h1>
        <p className="mt-2 text-center sam-text-body-secondary leading-relaxed text-sam-muted">{t("signup_desc")}</p>

        <div className="mt-5 space-y-2">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={!supabaseReady || busy !== null}
              onClick={() => void handleOAuth(provider.id)}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-medium text-sam-fg disabled:opacity-50"
            >
              {busy === provider.id ? t("signup_oauth_moving") : provider.label}
            </button>
          ))}
        </div>

        <div className="my-5 flex items-center gap-3 sam-text-helper text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span>{t("signup_or_email")}</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("signup_nickname")}</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              placeholder={t("signup_nickname_placeholder")}
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("signup_email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              placeholder={t("signup_email_placeholder")}
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("signup_password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
              placeholder={t("signup_password_placeholder")}
            />
          </div>
          {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
          {done ? <p className="sam-text-body-secondary text-green-700">{done}</p> : null}
          <button
            type="submit"
            disabled={!supabaseReady || busy !== null}
            className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white disabled:opacity-50"
          >
            {busy === "email" ? t("signup_submitting") : t("signup_submit")}
          </button>
        </form>

        <p className="mt-4 text-center sam-text-body-secondary text-sam-muted">
          {t("signup_has_account")}{" "}
          <Link href="/login" className="font-medium text-signature underline">
            {t("common_login")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function SignupFallback() {
  const { t } = useI18n();
  return <>{t("common_loading")}</>;
}

export default function SignupPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
          <SignupFallback />
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}
