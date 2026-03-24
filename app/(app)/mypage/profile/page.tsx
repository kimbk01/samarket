"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import type { Profile } from "@/lib/types/profile";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { MannerBatteryInline } from "@/components/trust/MannerBatteryDisplay";

export default function MypageProfilePage() {
  const [user, setUser] = useState<Profile | null>(() => getHydrationSafeCurrentUser());

  useEffect(() => {
    const sync = () => setUser(getCurrentUser());
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <AppBackButton backHref="/mypage" ariaLabel="뒤로" />
        <h1 className="text-lg font-semibold text-gray-900">프로필</h1>
      </header>
      <div className="px-4 py-6">
        {!user ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">로그인해 주세요.</p>
            <Link href="/mypage" className="mt-4 inline-block text-sm text-signature">
              마이페이지로
            </Link>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full bg-gray-200">
                {user.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl text-gray-400">
                    ?
                  </div>
                )}
              </div>
              <p className="mt-4 text-lg font-medium text-gray-900">{user.nickname}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
              <div className="mt-3 flex justify-center">
                <MannerBatteryInline raw={user.temperature} size="md" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
