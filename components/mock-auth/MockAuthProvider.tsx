"use client";

/**
 * 레거시 래퍼 — 실제 세션은 Supabase·`/api/auth/session` 기준.
 */
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
