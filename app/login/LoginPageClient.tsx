"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MyTestLoginSection } from "@/components/my/MyTestLoginSection";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { resolveManualMemberSignInEmail } from "@/lib/auth/manual-member-email";
import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { getSupabaseClient } from "@/lib/supabase/client";

const AUTH_REQUEST_TIMEOUT_MS = 25_000;
const AUTH_TIMEOUT_MESSAGE =
  "인증 서버(Supabase) 응답이 지연되거나 없습니다. 인터넷·VPN·방화벽을 확인하고, .env의 URL·anon 키가 대시보드와 일치하는지 확인한 뒤 다시 시도해 주세요.";

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, rejectAfter(ms, message)]);
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postLoginDestination = POST_LOGIN_PATH;
  const [oauthBusy, setOauthBusy] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.toString().length > 0) {
      router.replace("/login", { scroll: false });
    }
  }, [router, searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase 설정이 없습니다.");
      setLoading(false);
      return;
    }
    const signInEmail = resolveManualMemberSignInEmail(email);
    if (!signInEmail) {
      setError("이메일 또는 아이디를 입력하세요.");
      setLoading(false);
      return;
    }
    try {
      const ac = new AbortController();
      const tid = window.setTimeout(() => ac.abort(), 8_000);
      try {
        await fetch("/api/test-logout", {
          method: "POST",
          credentials: "include",
          signal: ac.signal,
        });
      } finally {
        window.clearTimeout(tid);
      }
    } catch {
      // Ignore local API delays before Supabase sign-in.
    }
    let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
    try {
      signInResult = await withTimeout(
        supabase.auth.signInWithPassword({ email: signInEmail, password }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE
      );
    } catch (e) {
      setLoading(false);
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError(AUTH_TIMEOUT_MESSAGE);
        return;
      }
      setError(describeSupabaseFetchFailure(e).userMessage);
      return;
    }
    const err = signInResult.error;
    if (err) {
      setLoading(false);
      const net = describeSupabaseFetchFailure(err);
      if (net.code !== "unknown") {
        setError(net.userMessage);
        return;
      }
      setError(err.message || "로그인에 실패했습니다.");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setError("세션이 저장되지 않았습니다. 쿠키·시크릿 모드를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    const loginUntilNavT0 = performance.now();
    const doubleRafT0 = performance.now();
    const fetchAuthT0 = performance.now();
    let sessionPromise: Promise<unknown> = Promise.resolve();
    await new Promise<void>((r) => {
      requestAnimationFrame(() => {
        sessionPromise = fetchAuthSessionNoStore().catch(() => {});
        requestAnimationFrame(() => r());
      });
    });
    recordAppWidePhaseLastMs("login_double_raf_ms", Math.round(performance.now() - doubleRafT0));
    try {
      await sessionPromise;
    } catch {
      // Ignore session sync failures here.
    }
    recordAppWidePhaseLastMs("login_fetch_auth_session_ms", Math.round(performance.now() - fetchAuthT0));
    recordAppWidePhaseLastMs("login_until_navigation_ms", Math.round(performance.now() - loginUntilNavT0));
    setLoading(false);
    window.location.assign(postLoginDestination);
  };

  const handleOAuthLogin = async (provider: "google" | "kakao" | "apple") => {
    setError("");
    setOauthBusy(provider);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase 설정이 없습니다.");
      setOauthBusy("");
      return;
    }
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    try {
      const { error: oauthError } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        AUTH_TIMEOUT_MESSAGE
      );
      if (oauthError) {
        setError(oauthError.message || "소셜 로그인을 시작하지 못했습니다.");
      }
    } catch (e) {
      if (e instanceof Error && e.message === AUTH_TIMEOUT_MESSAGE) {
        setError(AUTH_TIMEOUT_MESSAGE);
      } else {
        setError(describeSupabaseFetchFailure(e).userMessage);
      }
    } finally {
      setOauthBusy("");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-sam-fg">로그인</h1>
        <p className="mt-1 text-center sam-text-body-secondary text-sam-muted">구글, 카카오, 애플 또는 이메일 계정</p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("google")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "google" ? "이동 중…" : "구글로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("kakao")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "kakao" ? "이동 중…" : "카카오로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("apple")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "apple" ? "이동 중…" : "애플로 로그인"}
          </button>
        </div>
        <div className="my-4 flex items-center gap-3 sam-text-helper text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span>또는 이메일·비밀번호</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>
        <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">이메일</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 또는 수동 회원 아이디"
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !!oauthBusy}
            className="w-full rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white disabled:opacity-50"
          >
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <p className="mt-4 text-center sam-text-helper text-sam-muted">
          계정이 없으면{" "}
          <Link href="/signup" className="font-medium text-signature underline">
            회원가입
          </Link>
        </p>
        <p className="mt-3 text-center sam-text-xxs text-sam-meta">
          <a href="/api/system/supabase-project" className="underline">
            /api/system/supabase-project
          </a>
          {" · "}
          <a href="/api/system/supabase-connectivity" className="underline">
            supabase-connectivity
          </a>
        </p>
      </div>
      <div className="w-full max-w-sm">
        <MyTestLoginSection redirectTo={postLoginDestination} />
      </div>
    </div>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
          불러오는 중…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
