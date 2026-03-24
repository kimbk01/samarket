"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function TestSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase 설정이 없습니다.");
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: undefined },
    });
    setLoading(false);
    if (err) {
      setError(err.message || "가입에 실패했습니다.");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-center text-[15px] font-medium text-gray-900">
            계정이 생성되었습니다.
          </p>
          <p className="mt-2 text-center text-[13px] text-gray-600">
            위 이메일로 <strong>로그인</strong> 페이지에서 로그인하세요.
          </p>
          <p className="mt-4 rounded bg-amber-50 p-3 text-[12px] text-amber-800">
            <strong>관리자로 쓰려면</strong> .env.local에 추가:<br />
            <code className="mt-1 block break-all">NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL={email.trim()}</code>
          </p>
          <Link
            href="/login"
            className="mt-4 block w-full rounded-lg bg-signature py-2.5 text-center text-[14px] font-medium text-white"
          >
            로그인 페이지로
          </Link>
          <Link href="/home" className="mt-3 block text-center text-[13px] text-gray-500">
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-gray-900">테스트 회원가입</h1>
        <p className="mt-1 text-center text-[13px] text-gray-500">
          테스트용·채팅 테스트 후 삭제 예정
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            <label className="block text-[13px] font-medium text-gray-700">비밀번호 (6자 이상)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
          </div>
          {error && (
            <p className="text-[13px] text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-signature py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          >
            {loading ? "가입 중…" : "가입"}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] text-gray-500">
          이미 계정이 있으면{" "}
          <Link href="/login" className="font-medium text-signature underline">
            로그인
          </Link>
        </p>
        <Link href="/home" className="mt-3 block text-center text-[13px] text-gray-500">
          홈으로
        </Link>
      </div>
    </div>
  );
}
