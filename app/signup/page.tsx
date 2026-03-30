"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type OAuthProvider = "google" | "kakao" | "apple";

const PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: "google", label: "구글로 계속하기" },
  { id: "kakao", label: "카카오로 계속하기" },
  { id: "apple", label: "애플로 계속하기" },
];

function SignupPageContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next")?.trim() || "/my/account";
  const supabaseReady = useMemo(() => !!getSupabaseClient(), []);
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
      if (typeof document !== "undefined" && nick) {
        document.cookie = `samarket_signup_nickname=${encodeURIComponent(nick)}; path=/; max-age=600; SameSite=Lax`;
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
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-gray-900">회원가입</h1>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-500">
          구글, 카카오, 애플, 이메일로 가입할 수 있습니다. 로그인 후 필리핀 전화번호 인증 전까지는 열람만 가능하고
          글쓰기, 거래, 주문, 채팅은 사용할 수 없습니다.
        </p>

        <div className="mt-5 space-y-2">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={!supabaseReady || busy !== null}
              onClick={() => void handleOAuth(provider.id)}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-[14px] font-medium text-gray-900 disabled:opacity-50"
            >
              {busy === provider.id ? "이동 중…" : provider.label}
            </button>
          ))}
        </div>

        <div className="my-5 flex items-center gap-3 text-[12px] text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          <span>또는 이메일로 가입</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-700">닉네임</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              required
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-[14px]"
              placeholder="서비스에서 사용할 닉네임"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-[14px]"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-[14px]"
              placeholder="6자 이상"
            />
          </div>
          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          {done ? <p className="text-[13px] text-green-700">{done}</p> : null}
          <button
            type="submit"
            disabled={!supabaseReady || busy !== null}
            className="w-full rounded-xl bg-signature py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "email" ? "가입 중…" : "이메일로 가입"}
          </button>
        </form>

        <p className="mt-4 text-center text-[13px] text-gray-500">
          이미 계정이 있으면{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-signature underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-gray-500">
          불러오는 중…
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}
