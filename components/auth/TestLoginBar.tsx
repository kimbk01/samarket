"use client";

import { useCallback, useEffect, useState } from "react";
import { getTestAuth, setTestAuth, clearTestAuth } from "@/lib/auth/test-auth-store";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";

type AuthState = { userId: string; username: string; role: string } | null;

export function TestLoginBar() {
  const [auth, setAuth] = useState<AuthState>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => setAuth(getTestAuth()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "로그인 실패");
        return;
      }
      setTestAuth(data.userId, data.username, data.role);
      setUsername("");
      setPassword("");
      refresh();
    } catch {
      setError("요청 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/test-logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearTestAuth();
    setAuth(null);
    setError("");
  };

  if (!isTestUsersSurfaceEnabled()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[13px]">
      {auth ? (
        <>
          <span className="font-medium text-gray-800">
            {auth.username}
            <span className="ml-1 text-gray-500">
              (
              {auth.role === "master"
                ? "최고 관리자"
                : auth.role === "admin"
                  ? "관리자"
                  : auth.role === "special"
                    ? "특별회원"
                    : "일반"}
              )
            </span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded bg-gray-200 px-2 py-1 font-medium text-gray-700 hover:bg-gray-300"
          >
            로그아웃
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-20 rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="rounded bg-signature px-2 py-1 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "…" : "로그인"}
          </button>
          {error && <span className="text-red-600">{error}</span>}
        </>
      )}
    </div>
  );
}
