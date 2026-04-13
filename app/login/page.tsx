"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MyTestLoginSection } from "@/components/my/MyTestLoginSection";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { getSupabaseClient } from "@/lib/supabase/client";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";

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

function normalizeEmailForSignIn(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  return `${t.toLowerCase()}${MANUAL_LOCAL_EMAIL_SUFFIX}`;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** 세션 만료·프록시가 붙인 `?next=` 는 주소창에서 제거. 성공 후 이동은 항상 `POST_LOGIN_PATH` 로 통일 */
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
    const signInEmail = normalizeEmailForSignIn(email);
    if (!signInEmail) {
      setError("이메일 또는 아이디를 입력하세요.");
      setLoading(false);
      return;
    }
    /** Supabase 로그인 전에만 테스트용 HttpOnly 쿠키 제거 — 성공 직후 호출하면 쿠키 플러시와 겹칠 수 있음 */
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
      /* ignore — 로컬 API 지연 시에도 Supabase 로그인은 진행 */
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
    /** `document.cookie` 반영 후 이동 — 없으면 첫 보호 경로 요청에 sb 쿠키가 비는 경우가 있음 */
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    /** 서버 Route Handler 세션과 동기화 — 바로 다음 HTML 요청이 401·로그인 루프 나는 것 완화 */
    try {
      await fetchAuthSessionNoStore();
    } catch {
      /* ignore */
    }
    setLoading(false);
    /**
     * `router.push` 만 쓰면 로그인 직후 RSC/프록시가 쿠키 없이 돌고 `/login` 으로 튕기는 경우가 있음.
     * 전체 네비게이션으로 `sb-*-auth-token` 이 다음 요청에 반드시 실리게 함.
     */
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
        <p className="mt-1 text-center text-[13px] text-sam-muted">구글, 카카오, 애플 또는 이메일 계정</p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("google")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-[14px] font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "google" ? "이동 중…" : "구글로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("kakao")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-[14px] font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "kakao" ? "이동 중…" : "카카오로 로그인"}
          </button>
          <button
            type="button"
            disabled={!!oauthBusy || loading}
            onClick={() => void handleOAuthLogin("apple")}
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-[14px] font-medium text-sam-fg disabled:opacity-50"
          >
            {oauthBusy === "apple" ? "이동 중…" : "애플로 로그인"}
          </button>
        </div>
        <div className="my-4 flex items-center gap-3 text-[12px] text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span>또는 이메일·비밀번호</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>
        <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="block text-[13px] font-medium text-sam-fg">이메일</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="회원가입 시 입력한 이메일 주소"
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-sam-meta">
              <span className="text-sam-fg/90">회원가입(/signup) 계정</span>은 반드시 가입할 때 쓴 이메일
              전체를 입력하세요. @ 없이만 입력하면{" "}
              <span className="whitespace-nowrap">아이디@manual.local</span> 형태로 전송되며, 이는{" "}
              <span className="text-sam-fg/90">관리자 수동·내부 테스트 계정</span>용입니다. 테스트용 아이디
              로그인은 아래「아이디 로그인」칸을 사용하세요.
            </p>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-sam-fg">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
            />
          </div>
          {error ? (
            <div className="space-y-1">
              <p className="text-[13px] text-red-600">{error}</p>
              {process.env.NODE_ENV === "development" &&
              (error === AUTH_TIMEOUT_MESSAGE ||
                error.includes("Supabase 주소를 DNS에서") ||
                error.includes("Supabase 서버에 연결하지")) ? (
                <p className="text-[12px] text-sam-meta">
                  개발 서버에서{" "}
                  <a href="/api/system/supabase-connectivity" className="underline">
                    /api/system/supabase-connectivity
                  </a>
                  를 열거나 터미널에서{" "}
                  <code className="rounded bg-sam-border-soft px-1">npm run check:supabase-dns</code> 로 DNS를
                  확인할 수 있습니다.
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || !!oauthBusy}
            className="w-full rounded-ui-rect bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-sam-muted">
          계정이 없으면{" "}
          <Link href="/signup" className="font-medium text-signature underline">
            회원가입
          </Link>
        </p>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-sam-meta">
          피드·매장·채팅 등 서비스는 로그인 후 이용할 수 있습니다.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <MyTestLoginSection redirectTo={postLoginDestination} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
