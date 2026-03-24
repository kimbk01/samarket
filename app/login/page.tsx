"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { setTestAuth } from "@/lib/auth/test-auth-store";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";

export default function LoginPage() {
  const showTestUsers = isTestUsersSurfaceEnabled();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [idLogin, setIdLogin] = useState("");
  const [idPassword, setIdPassword] = useState("");
  const [idError, setIdError] = useState("");
  const [idLoading, setIdLoading] = useState(false);

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
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) {
      setError(err.message || "로그인에 실패했습니다.");
      return;
    }
    try {
      await fetch("/api/test-logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    router.push("/home");
    router.refresh();
  };

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdError("");
    setIdLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/api/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: idLogin.trim().toLowerCase(),
          password: idPassword,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setIdError(data?.error || "아이디 또는 비밀번호를 확인해 주세요.");
        return;
      }
      setTestAuth(data.userId, data.username, String(data.role ?? "member"));
      setIdPassword("");
      router.push("/home");
      router.refresh();
    } catch {
      setIdError("요청에 실패했습니다.");
    } finally {
      setIdLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">이메일 로그인</h1>
        <p className="mt-1 text-center text-[13px] text-gray-500">Supabase 계정</p>
        <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
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
            disabled={loading}
            className="w-full rounded-lg bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>
        {showTestUsers ? (
          <p className="mt-4 text-center text-[12px] text-gray-500">
            계정이 없으면{" "}
            <Link href="/test-signup" className="font-medium text-signature underline">
              테스트 회원가입
            </Link>
          </p>
        ) : null}
      </div>

      {showTestUsers ? (
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-center text-lg font-semibold text-gray-900">아이디 로그인</h2>
        <p className="mt-1 text-center text-[13px] leading-relaxed text-gray-500">
          관리자 «회원 관리 → 수동 입력»으로 만든 <strong>로그인 아이디</strong>입니다. 쿠키로 회원 UUID가
          고정되며, 여러 계정 동시 테스트는 브라우저(또는 프로필·시크릿)를 나누세요.
        </p>
        <form onSubmit={handleIdSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-700">아이디</label>
            <input
              type="text"
              value={idLogin}
              onChange={(e) => setIdLogin(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={idPassword}
              onChange={(e) => setIdPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
          </div>
          {idError ? <p className="text-[13px] text-red-600">{idError}</p> : null}
          <button
            type="submit"
            disabled={idLoading}
            className="w-full rounded-lg border-2 border-signature bg-white py-2.5 text-[14px] font-medium text-signature disabled:opacity-50"
          >
            {idLoading ? "로그인 중…" : "아이디로 로그인"}
          </button>
        </form>
      </div>
      ) : null}

      <Link href="/home" className="text-[13px] text-gray-500 underline">
        홈으로
      </Link>
    </div>
  );
}
