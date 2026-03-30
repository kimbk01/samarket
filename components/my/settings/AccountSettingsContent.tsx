"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";

export function AccountSettingsContent() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    void getMyProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] text-gray-500">이메일</p>
        <p className="text-[15px] text-gray-900">{profile?.email ?? "—"}</p>
      </div>
      <div>
        <p className="text-[12px] text-gray-500">전화번호</p>
        <p className="text-[15px] text-gray-900">{profile?.phone ?? "등록된 전화번호 없음"}</p>
      </div>
      <div>
        <p className="text-[12px] text-gray-500">전화번호 인증</p>
        <p className="text-[15px] text-gray-900">
          {profile?.phone_verified
            ? "완료"
            : profile?.phone_verification_status === "pending"
              ? "승인 대기"
              : "미인증"}
        </p>
      </div>
      <Link href="/my/account/phone-verification" className="block text-[13px] text-signature underline">
        전화번호 인증 요청 관리
      </Link>
    </div>
  );
}
