"use client";

import Link from "next/link";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { getSupabaseClient } from "@/lib/supabase/client";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

/** Supabase auth signOut 후 `/home` 요청 → 세션 없으면 `proxy` 가 `/login` 으로 보냄 */
export function LogoutContent() {
  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase && typeof (supabase as { auth?: { signOut?: () => Promise<unknown> } }).auth?.signOut === "function") {
      await (supabase as { auth: { signOut: () => Promise<unknown> } }).auth.signOut();
    }
    invalidateMeProfileDedupedCache();
    window.location.href = POST_LOGIN_PATH;
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-sam-fg">로그아웃 하시겠습니까?</p>
      <div className="flex gap-3">
        <Link
          href={MYPAGE_MAIN_HREF}
          className="flex-1 rounded-ui-rect border border-sam-border py-2.5 text-center text-[14px] font-medium text-sam-fg"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 text-[14px] font-medium text-white"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
