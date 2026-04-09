"use client";

import Link from "next/link";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Supabase auth signOut 후 `/home` 요청 → 세션 없으면 `proxy` 가 `/login` 으로 보냄 */
export function LogoutContent() {
  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase && typeof (supabase as { auth?: { signOut?: () => Promise<unknown> } }).auth?.signOut === "function") {
      await (supabase as { auth: { signOut: () => Promise<unknown> } }).auth.signOut();
    }
    window.location.href = POST_LOGIN_PATH;
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-700">로그아웃 하시겠습니까?</p>
      <div className="flex gap-3">
        <Link
          href={buildMypageInfoHubHref()}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center text-[14px] font-medium text-gray-700"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 rounded-lg bg-gray-900 py-2.5 text-[14px] font-medium text-white"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
