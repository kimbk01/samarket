"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

/** 관리자 수동 생성 시 이메일 미입력이면 `{username}@manual.local` — 동일 규칙으로 로그인 */
const MANUAL_LOCAL_EMAIL_SUFFIX = "@manual.local";

/** 브라우저→Supabase 요청이 끊기거나 극단적으로 느릴 때 UI가 멈추지 않도록 */
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

/** `next` 쿼리 오픈 리다이렉트 방지 — 앱 내부 경로만 허용 */
function safeInternalPath(raw: string): string {
  const t = raw.trim() || "/home";
  if (!t.startsWith("/") || t.startsWith("//")) return "/home";
  const noQuery = t.split("?")[0].split("#")[0];
  if (noQuery.includes(":")) return "/home";
  return t;
}

function normalizeEmailForSignIn(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  return `${t.toLowerCase()}${MANUAL_LOCAL_EMAIL_SUFFIX}`;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const next = safeInternalPath(searchParams.get("next")?.trim() || "/home");
  const [oauthBusy, setOauthBusy] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    const signInEmail = normalizeEmailForSignIn(email);
    if (!signInEmail) {
      setError("이메일 또는 아이디를 입력하세요.");
      setLoading(false);
      return;
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
      setError(e instanceof Error ? e.message : AUTH_TIMEOUT_MESSAGE);
      return;
    }
    setLoading(false);
    const err = signInResult.error;
    if (err) {
      setError(err.message || "로그인에 실패했습니다.");
      return;
    }
    try {
      await fetch("/api/test-logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    /**
     * `router.push` 만 쓰면 로그인 직후 RSC/프록시가 쿠키 없이 돌고 `/login` 으로 튕기는 경우가 있음.
     * 전체 네비게이션으로 `sb-*-auth-token` 이 다음 요청에 반드시 실리게 함.
     */
    window.location.assign(next);
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
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        : undefined;
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
      setError(e instanceof Error ? e.message : AUTH_TIMEOUT_MESSAGE);
    } finally {
      setOauthBusy("");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">로그인</h1>
        <p className="mt-1 text-center text-[13px] text-gray-500">구글, 카카오, 애플 또는 이메일 계정</p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("google")}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-[14px] font-medium text-gray-900 disabled:opacity-50"
          >
            {oauthBusy === "google" ? "이동 중…" : "구글로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("kakao")}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-[14px] font-medium text-gray-900 disabled:opacity-50"
          >
            {oauthBusy === "kakao" ? "이동 중…" : "카카오로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("apple")}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-[14px] font-medium text-gray-900 disabled:opacity-50"
          >
            {oauthBusy === "apple" ? "이동 중…" : "애플로 로그인"}
          </button>
        </div>
        <div className="my-4 flex items-center gap-3 text-[12px] text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          <span>또는 이메일</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">이메일 또는 아이디</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소 또는 로그인 아이디"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
          </div>
          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !!oauthBusy}
            className="w-full rounded-lg bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-gray-500">
          계정이 없으면{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-signature underline">
            회원가입
          </Link>
        </p>
      </div>

      <Link href="/home" className="text-[13px] text-gray-500 underline">
        홈으로
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-gray-500">
          불러오는 중…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
